import { and, eq, ne, param, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { JoinRequest, MemberSummary, Page, TeamDetail, TeamSummary, ViewerTeamState } from "../../shared/api-types.js";
import { LIMITS, type RoleId, type TeamStatus } from "../../shared/constants.js";
import { normalizeTeamLink } from "../../shared/normalize.js";
import { decideRequestSchema, joinRequestSchema, teamInputSchema, teamsQuerySchema } from "../../shared/schemas.js";
import { normalizeTags, tagKey } from "../../shared/tags.js";
import { db } from "../db/client.js";
import { profiles, teamJoinRequests, teamMembers, teams } from "../db/schema.js";
import { AppError, body, currentUser, forbidden, notFound, query, rateLimit, requireAuth, type AppEnv } from "../lib/http.js";
import { notifyAccepted, notifyJoinRequest } from "../lib/notify.js";
import { avatarUrl, likeEscape } from "../lib/profile-view.js";

export const teamRoutes = new Hono<AppEnv>();
teamRoutes.use("*", requireAuth);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_TEAMS_PER_OWNER = 5;

type TeamRow = {
  id: string;
  name: string;
  hackathon_name: string | null;
  description: string;
  needed_skills: string[];
  needed_roles: string[];
  timeline: string | null;
  status: TeamStatus;
  max_members: number;
  member_count: number;
  owner_id: string;
  owner_name: string;
  owner_avatar_version: number;
  members_preview: { id: string; name: string; v: number }[];
  viewer_state: ViewerTeamState;
  created_at: string;
  updated_at: string;
  total?: string;
};

const SUMMARY_SELECT = (viewerId: string) => sql`
  t.id, t.name, t.hackathon_name, t.description, t.needed_skills, t.needed_roles, t.timeline, t.status,
  t.max_members, t.owner_id, t.created_at, t.updated_at,
  op.name AS owner_name, op.avatar_version AS owner_avatar_version,
  (SELECT count(*)::int FROM team_members m WHERE m.team_id = t.id) AS member_count,
  COALESCE((SELECT json_agg(json_build_object('id', x.user_id, 'name', x.name, 'v', x.avatar_version) ORDER BY x.joined_at)
            FROM (SELECT m.user_id, mp.name, mp.avatar_version, m.joined_at FROM team_members m
                  JOIN profiles mp ON mp.user_id = m.user_id WHERE m.team_id = t.id ORDER BY m.joined_at LIMIT 5) x), '[]'::json)
    AS members_preview,
  CASE
    WHEN t.owner_id = ${viewerId} THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = ${viewerId}) THEN 'member'
    WHEN EXISTS (SELECT 1 FROM team_join_requests r WHERE r.team_id = t.id AND r.user_id = ${viewerId} AND r.status = 'pending') THEN 'pending'
    ELSE 'none'
  END AS viewer_state`;

function toSummary(r: TeamRow): TeamSummary {
  return {
    id: r.id,
    name: r.name,
    hackathonName: r.hackathon_name,
    description: r.description,
    neededSkills: r.needed_skills,
    neededRoles: r.needed_roles as RoleId[],
    timeline: r.timeline,
    status: r.status,
    maxMembers: r.max_members,
    memberCount: r.member_count,
    owner: { id: r.owner_id, name: r.owner_name, avatarUrl: avatarUrl(r.owner_id, r.owner_avatar_version) },
    members: r.members_preview.map((m) => ({ id: m.id, name: m.name, avatarUrl: avatarUrl(m.id, m.v) })),
    viewerState: r.viewer_state,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function listTeams(
  viewerId: string,
  opts: { q?: string; skills?: string[]; status?: TeamStatus; mine?: boolean; ownerId?: string; page: number; includeClosed?: boolean },
): Promise<Page<TeamSummary>> {
  const where: SQL[] = [sql`TRUE`];
  if (opts.q) {
    const like = `%${likeEscape(opts.q.toLowerCase())}%`;
    where.push(sql`(lower(t.name) LIKE ${like} OR lower(coalesce(t.hackathon_name,'')) LIKE ${like} OR lower(t.description) LIKE ${like})`);
  }
  if (opts.skills?.length) where.push(sql`t.needed_skills_key && ${param(opts.skills.map(tagKey))}::text[]`);
  if (opts.status) where.push(sql`t.status = ${opts.status}`);
  else if (!opts.mine && !opts.includeClosed) where.push(sql`t.status <> 'closed'`);
  if (opts.mine) where.push(sql`EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = ${viewerId})`);
  if (opts.ownerId) where.push(sql`t.owner_id = ${opts.ownerId}`);

  const offset = (opts.page - 1) * LIMITS.pageSize;
  const res = await db().execute<TeamRow>(sql`
    SELECT ${SUMMARY_SELECT(viewerId)}, count(*) OVER () AS total
    FROM teams t JOIN profiles op ON op.user_id = t.owner_id
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY (t.status = 'recruiting') DESC, t.created_at DESC, t.id
    LIMIT ${LIMITS.pageSize} OFFSET ${offset}`);
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return { items: res.rows.map(toSummary), page: opts.page, pageSize: LIMITS.pageSize, total, hasMore: offset + res.rows.length < total };
}

async function teamDetail(viewerId: string, teamId: string): Promise<TeamDetail> {
  const res = await db().execute<TeamRow & { contact_link: string | null }>(sql`
    SELECT ${SUMMARY_SELECT(viewerId)}, t.contact_link
    FROM teams t JOIN profiles op ON op.user_id = t.owner_id WHERE t.id = ${teamId}`);
  const row = res.rows[0];
  if (!row) throw notFound("Team not found");
  const summary = toSummary(row);
  const isInside = summary.viewerState === "owner" || summary.viewerState === "member";

  const members = await db().execute<{ id: string; name: string; v: number; role: "owner" | "member"; roles: string[]; skills: string[] }>(sql`
    SELECT m.user_id AS id, p.name, p.avatar_version AS v, m.role, p.roles, p.skills
    FROM team_members m JOIN profiles p ON p.user_id = m.user_id
    WHERE m.team_id = ${teamId} ORDER BY (m.role = 'owner') DESC, m.joined_at`);

  let pendingRequests: JoinRequest[] | null = null;
  if (summary.viewerState === "owner") {
    const reqs = await db().execute<{
      id: string; message: string | null; created_at: string; user_id: string; name: string; v: number;
      skills: string[]; roles: string[]; college: string | null; graduation_year: number | null; year_of_study: string | null;
    }>(sql`
      SELECT r.id, r.message, r.created_at, p.user_id, p.name, p.avatar_version AS v, p.skills, p.roles, p.college,
             p.graduation_year, p.year_of_study
      FROM team_join_requests r JOIN profiles p ON p.user_id = r.user_id
      WHERE r.team_id = ${teamId} AND r.status = 'pending' ORDER BY r.created_at`);
    pendingRequests = reqs.rows.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: new Date(r.created_at).toISOString(),
      person: {
        id: r.user_id, name: r.name, avatarUrl: avatarUrl(r.user_id, r.v), skills: r.skills, roles: r.roles as RoleId[],
        college: r.college, graduationYear: r.graduation_year, yearOfStudy: r.graduation_year ? null : r.year_of_study,
      },
    }));
  }

  let viewerRequest: TeamDetail["viewerRequest"] = null;
  if (summary.viewerState === "pending") {
    const [r] = await db()
      .select({ id: teamJoinRequests.id, createdAt: teamJoinRequests.createdAt })
      .from(teamJoinRequests)
      .where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.userId, viewerId), eq(teamJoinRequests.status, "pending")))
      .limit(1);
    if (r) viewerRequest = { id: r.id, status: "pending", createdAt: r.createdAt.toISOString() };
  }

  return {
    ...summary,
    members: members.rows.map<MemberSummary>((m) => ({
      id: m.id, name: m.name, avatarUrl: avatarUrl(m.id, m.v), role: m.role, roles: m.roles as RoleId[], skills: m.skills,
    })),
    contactLink: isInside ? row.contact_link : null,
    pendingRequests,
    viewerRequest,
  };
}

function teamValues(input: ReturnType<typeof teamInputSchema.parse>) {
  const skills = normalizeTags(input.neededSkills, LIMITS.skills);
  return {
    name: input.name,
    hackathonName: input.hackathonName,
    description: input.description,
    neededSkills: skills.labels,
    neededSkillsKey: skills.keys,
    neededRoles: input.neededRoles,
    timeline: input.timeline,
    maxMembers: input.maxMembers,
    contactLink: normalizeTeamLink(input.contactLink),
    status: input.status,
  };
}

const parseId = (id: string) => {
  if (!UUID.test(id)) throw notFound("Team not found");
  return id;
};

/** Locks the team row for the rest of the transaction so membership changes can't race. */
async function lockTeam(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], teamId: string) {
  const r = await tx.execute<{ id: string; owner_id: string; status: TeamStatus; max_members: number; members: number }>(sql`
    SELECT t.id, t.owner_id, t.status, t.max_members,
           (SELECT count(*)::int FROM team_members m WHERE m.team_id = t.id) AS members
    FROM teams t WHERE t.id = ${teamId} FOR UPDATE`);
  if (!r.rows[0]) throw notFound("Team not found");
  return r.rows[0];
}

/* ── Routes ── */

teamRoutes.get("/", rateLimit("teams-list", { window: 60, max: 120 }), async (c) => {
  const viewerId = currentUser(c).id;
  const q = query(c, teamsQuerySchema);
  return c.json(await listTeams(viewerId, { q: q.q, skills: q.skills, status: q.status, mine: q.mine === "1", page: q.page }));
});

teamRoutes.post("/", rateLimit("team-create", { window: 3600, max: 10 }), async (c) => {
  const user = currentUser(c);
  const input = await body(c, teamInputSchema);
  const values = teamValues(input);
  const [p] = await db().select({ onboardedAt: profiles.onboardedAt }).from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!p?.onboardedAt) throw new AppError(403, "profile_incomplete", "Finish setting up your profile before creating a team");
  const id = await db().transaction(async (tx) => {
    const [{ n }] = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM teams WHERE owner_id = ${user.id} AND status <> 'closed'`).then((r) => r.rows);
    if (n >= MAX_ACTIVE_TEAMS_PER_OWNER) {
      throw new AppError(409, "too_many_teams", `You can run up to ${MAX_ACTIVE_TEAMS_PER_OWNER} open teams at once. Close one first.`);
    }
    const [t] = await tx.insert(teams).values({ ...values, ownerId: user.id }).returning({ id: teams.id });
    await tx.insert(teamMembers).values({ teamId: t.id, userId: user.id, role: "owner" });
    return t.id;
  });
  return c.json(await teamDetail(user.id, id), 201);
});

teamRoutes.get("/:id", async (c) => c.json(await teamDetail(currentUser(c).id, parseId(c.req.param("id")))));

teamRoutes.patch("/:id", rateLimit("team-write", { window: 60, max: 30 }), async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  const input = await body(c, teamInputSchema);
  const values = teamValues(input);
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, id);
    if (t.owner_id !== user.id) throw forbidden("Only the team owner can edit this team");
    if (values.maxMembers < t.members) {
      throw new AppError(400, "validation_failed", `The team already has ${t.members} members`, { maxMembers: `Must be at least ${t.members}` });
    }
    await tx.update(teams).set({ ...values, updatedAt: new Date() }).where(eq(teams.id, id));
    if (values.status !== "recruiting") {
      // closing or marking full ends any pending requests (decidedBy null = automatic, not the owner's verdict)
      await tx
        .update(teamJoinRequests)
        .set({ status: "declined", decidedAt: new Date(), decidedBy: null })
        .where(and(eq(teamJoinRequests.teamId, id), eq(teamJoinRequests.status, "pending")));
    }
  });
  return c.json(await teamDetail(user.id, id));
});

teamRoutes.delete("/:id", async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, id);
    if (t.owner_id !== user.id) throw forbidden("Only the team owner can delete this team");
    await tx.delete(teams).where(eq(teams.id, id));
  });
  return c.json({ ok: true });
});

teamRoutes.post("/:id/requests", rateLimit("join-request", { window: 3600, max: 30 }), async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  const input = await body(c, joinRequestSchema);
  const [p] = await db().select({ onboardedAt: profiles.onboardedAt }).from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!p?.onboardedAt) throw new AppError(403, "profile_incomplete", "Finish setting up your profile before asking to join");
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, id);
    const isMember = await tx.execute(sql`SELECT 1 FROM team_members WHERE team_id = ${id} AND user_id = ${user.id}`);
    if (isMember.rows.length) throw new AppError(409, "already_member", "You're already on this team");
    if (t.status !== "recruiting") throw new AppError(409, "not_recruiting", "This team isn't taking new members");
    if (t.members >= t.max_members) throw new AppError(409, "team_full", "This team is full");
    // After a decline, wait a day before asking again (keeps owners' inboxes free of repeat requests).
    const recent = await tx.execute(sql`
      SELECT 1 FROM team_join_requests
      WHERE team_id = ${id} AND user_id = ${user.id} AND status = 'declined' AND decided_by = ${t.owner_id}
        AND decided_at > now() - interval '24 hours' LIMIT 1`);
    if (recent.rows.length) throw new AppError(429, "recently_declined", "The owner declined your last request. You can ask again tomorrow.");
    const inserted = await tx
      .insert(teamJoinRequests)
      .values({ teamId: id, userId: user.id, message: input.message })
      .onConflictDoNothing()
      .returning({ id: teamJoinRequests.id });
    if (!inserted.length) throw new AppError(409, "already_requested", "You've already asked to join this team");
  });
  notifyJoinRequest(id, user.id, input.message ?? null);
  return c.json(await teamDetail(user.id, id), 201);
});

teamRoutes.delete("/:id/requests/mine", async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  const r = await db()
    .update(teamJoinRequests)
    .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: user.id })
    .where(and(eq(teamJoinRequests.teamId, id), eq(teamJoinRequests.userId, user.id), eq(teamJoinRequests.status, "pending")))
    .returning({ id: teamJoinRequests.id });
  if (!r.length) throw notFound("No pending request to withdraw");
  return c.json(await teamDetail(user.id, id));
});

teamRoutes.post("/:id/requests/:requestId", rateLimit("team-write", { window: 60, max: 60 }), async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  const requestId = parseId(c.req.param("requestId"));
  const { decision } = await body(c, decideRequestSchema);
  const acceptedUser = await db().transaction(async (tx) => {
    const t = await lockTeam(tx, id);
    if (t.owner_id !== user.id) throw forbidden("Only the team owner can respond to requests");
    const [req] = await tx
      .select()
      .from(teamJoinRequests)
      .where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.teamId, id)))
      .for("update");
    if (!req || req.status !== "pending") throw notFound("That request is no longer pending");
    if (decision === "accept") {
      if (t.members >= t.max_members) throw new AppError(409, "team_full", "The team is full. Raise the member limit first.");
      await tx.insert(teamMembers).values({ teamId: id, userId: req.userId, role: "member" }).onConflictDoNothing();
      if (t.members + 1 >= t.max_members) {
        await tx.update(teams).set({ status: "full", updatedAt: new Date() }).where(eq(teams.id, id));
        await tx
          .update(teamJoinRequests)
          .set({ status: "declined", decidedAt: new Date(), decidedBy: null })
          .where(and(eq(teamJoinRequests.teamId, id), eq(teamJoinRequests.status, "pending"), ne(teamJoinRequests.id, requestId)));
      }
    }
    await tx
      .update(teamJoinRequests)
      .set({ status: decision === "accept" ? "accepted" : "declined", decidedAt: new Date(), decidedBy: user.id })
      .where(eq(teamJoinRequests.id, requestId));
    return decision === "accept" ? req.userId : null;
  });
  if (acceptedUser) notifyAccepted(id, acceptedUser);
  return c.json(await teamDetail(user.id, id));
});

teamRoutes.post("/:id/leave", async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, id);
    if (t.owner_id === user.id) throw new AppError(409, "owner_cannot_leave", "Owners can't leave their own team — close or delete it instead");
    const r = await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, user.id)))
      .returning({ u: teamMembers.userId });
    if (!r.length) throw notFound("You're not on this team");
    if (t.status === "full") await tx.update(teams).set({ status: "recruiting", updatedAt: new Date() }).where(eq(teams.id, id));
  });
  return c.json({ ok: true });
});

teamRoutes.delete("/:id/members/:userId", async (c) => {
  const user = currentUser(c);
  const id = parseId(c.req.param("id"));
  const memberId = parseId(c.req.param("userId"));
  await db().transaction(async (tx) => {
    const t = await lockTeam(tx, id);
    if (t.owner_id !== user.id) throw forbidden("Only the team owner can remove members");
    if (memberId === user.id) throw new AppError(409, "owner_cannot_leave", "You can't remove yourself as owner");
    const r = await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, memberId)))
      .returning({ u: teamMembers.userId });
    if (!r.length) throw notFound("That person isn't on this team");
    if (t.status === "full") await tx.update(teams).set({ status: "recruiting", updatedAt: new Date() }).where(eq(teams.id, id));
  });
  return c.json(await teamDetail(user.id, id));
});
