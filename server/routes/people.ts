import { eq, param, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { Page, PersonCard, PersonDetail, PopularTags } from "../../shared/api-types.js";
import { LIMITS } from "../../shared/constants.js";
import { peopleQuerySchema } from "../../shared/schemas.js";
import { tagKey } from "../../shared/tags.js";
import { db } from "../db/client.js";
import { avatars, profiles } from "../db/schema.js";
import { AppError, currentUser, notFound, query, rateLimit, requireAuth, type AppEnv } from "../lib/http.js";
import { PUBLIC_PROFILE_COLUMNS, likeEscape, toCard, type PublicRow, type Viewer } from "../lib/profile-view.js";
import { listTeams } from "./teams.js";

export const people = new Hono<AppEnv>();
people.use("*", requireAuth);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function viewerOf(userId: string): Promise<Viewer> {
  const [v] = await db()
    .select({ skills_key: profiles.skillsKey, interests_key: profiles.interestsKey, roles: profiles.roles, skills: profiles.skills, interests: profiles.interests })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return v ?? null;
}

/** Viewer may see target if it's themselves, a discoverable onboarded profile, or someone they share a team / pending request with. */
export const canViewSql = (viewerId: string, targetCol: SQL) => sql`(
  ${targetCol} = ${viewerId}
  OR (p.onboarded_at IS NOT NULL AND p.discoverable)
  OR EXISTS (SELECT 1 FROM team_members a JOIN team_members b ON a.team_id = b.team_id
             WHERE a.user_id = ${viewerId} AND b.user_id = ${targetCol})
  OR EXISTS (SELECT 1 FROM team_join_requests r JOIN teams t ON t.id = r.team_id
             WHERE r.status = 'pending' AND ((r.user_id = ${targetCol} AND t.owner_id = ${viewerId})
                                          OR (r.user_id = ${viewerId} AND t.owner_id = ${targetCol})))
)`;

people.get("/", rateLimit("people-list", { window: 60, max: 120 }), async (c) => {
  const viewerId = currentUser(c).id;
  const q = query(c, peopleQuerySchema);
  const viewer = await viewerOf(viewerId);
  const mySkills = viewer?.skills_key ?? [];
  const myInterests = viewer?.interests_key ?? [];
  const myRoles = viewer?.roles ?? [];

  const where: SQL[] = [sql`p.onboarded_at IS NOT NULL`, sql`p.discoverable`, sql`p.user_id <> ${viewerId}`];
  if (q.q) {
    const like = `%${likeEscape(q.q.toLowerCase())}%`;
    where.push(sql`(lower(p.name) LIKE ${like}
      OR lower(coalesce(p.college, '')) LIKE ${like}
      OR EXISTS (SELECT 1 FROM unnest(p.skills_key || p.interests_key) k WHERE k LIKE ${like}))`);
  }
  if (q.skills.length) where.push(sql`p.skills_key @> ${param(q.skills.map(tagKey))}::text[]`);
  if (q.interests.length) where.push(sql`p.interests_key && ${param(q.interests.map(tagKey))}::text[]`);
  if (q.roles.length) where.push(sql`p.roles && ${param(q.roles)}::text[]`);
  if (q.availability) where.push(sql`p.availability = ${q.availability}`);
  if (q.graduationYear) where.push(sql`p.graduation_year = ${q.graduationYear}`);
  if (q.college) where.push(sql`lower(p.college) LIKE ${`%${likeEscape(q.college.toLowerCase())}%`}`);

  /*
   * Compatibility score — favours people who share your interests (common ground) and cover roles
   * and skills you don't (complementary), plus a nudge for people actively looking for a team.
   */
  const score = sql`(
      3 * cardinality(ARRAY(SELECT unnest(p.interests_key) INTERSECT SELECT unnest(${param(myInterests)}::text[])))
    + 2 * LEAST(3, cardinality(ARRAY(SELECT unnest(p.roles) EXCEPT SELECT unnest(${param(myRoles)}::text[]))))
    + LEAST(5, cardinality(ARRAY(SELECT unnest(p.skills_key) EXCEPT SELECT unnest(${param(mySkills)}::text[]))))
    + CASE p.availability WHEN 'looking' THEN 2 WHEN 'open' THEN 1 ELSE 0 END
  )`;
  const order = q.sort === "recent" ? sql`p.created_at DESC, p.user_id` : sql`score DESC, p.updated_at DESC, p.user_id`;
  const offset = (q.page - 1) * LIMITS.pageSize;

  const res = await db().execute<PublicRow & { score: number; total: string }>(sql`
    SELECT ${PUBLIC_PROFILE_COLUMNS}, ${score} AS score, count(*) OVER () AS total
    FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY ${order}
    LIMIT ${LIMITS.pageSize} OFFSET ${offset}
  `);
  const total = res.rows[0] ? Number(res.rows[0].total) : await countOnly(where);
  const page: Page<PersonCard> = {
    items: res.rows.map((r) => toCard(r, viewer, r.score)),
    page: q.page,
    pageSize: LIMITS.pageSize,
    total,
    hasMore: offset + res.rows.length < total,
  };
  return c.json(page);
});

async function countOnly(where: SQL[]) {
  const r = await db().execute<{ n: string }>(sql`SELECT count(*) n FROM profiles p WHERE ${sql.join(where, sql` AND `)}`);
  return Number(r.rows[0]?.n ?? 0);
}

people.get("/tags", async (c) => {
  const top = async (col: "skills" | "interests") => {
    const r = await db().execute<{ label: string; count: string }>(sql`
      SELECT min(t.label) AS label, count(*) AS count
      FROM profiles p, unnest(p.${sql.raw(col)}, p.${sql.raw(col + "_key")}) AS t(label, key)
      WHERE p.onboarded_at IS NOT NULL AND p.discoverable
      GROUP BY t.key ORDER BY count(*) DESC, t.key LIMIT 16`);
    return r.rows.map((x) => ({ label: x.label, count: Number(x.count) }));
  };
  const body: PopularTags = { skills: await top("skills"), interests: await top("interests") };
  c.header("Cache-Control", "private, max-age=300");
  return c.json(body);
});

people.get("/:id", async (c) => {
  const viewerId = currentUser(c).id;
  const id = c.req.param("id");
  if (!UUID.test(id)) throw notFound("Profile not found");
  const res = await db().execute<PublicRow>(sql`
    SELECT ${PUBLIC_PROFILE_COLUMNS}
    FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ${id} AND ${canViewSql(viewerId, sql`p.user_id`)}
    LIMIT 1`);
  const row = res.rows[0];
  // Same 404 for "doesn't exist" and "not visible to you" so hidden profiles can't be probed.
  if (!row) throw notFound("Profile not found");
  const viewer = id === viewerId ? null : await viewerOf(viewerId);
  const teamsPage = await listTeams(viewerId, { ownerId: id, page: 1, includeClosed: false });
  const detail: PersonDetail = {
    ...toCard(row, viewer),
    yearOfStudy: row.graduation_year ? null : row.year_of_study,
    degree: row.degree,
    hackathonInterests: row.hackathon_interests,
    projects: row.projects,
    teams: teamsPage.items,
    isSelf: id === viewerId,
  };
  return c.json(detail);
});

/* ── Avatar bytes ── */
export const avatarRoutes = new Hono<AppEnv>();
avatarRoutes.use("*", requireAuth);
avatarRoutes.get("/:id", async (c) => {
  const viewerId = currentUser(c).id;
  const id = c.req.param("id");
  if (!UUID.test(id)) throw notFound();
  const allowed = await db().execute(sql`
    SELECT 1 FROM profiles p WHERE p.user_id = ${id} AND ${canViewSql(viewerId, sql`p.user_id`)} LIMIT 1`);
  if (!allowed.rows.length) throw notFound();
  const [a] = await db().select().from(avatars).where(eq(avatars.userId, id)).limit(1);
  if (!a) throw notFound();
  const etag = `"${a.updatedAt.getTime().toString(36)}-${a.byteSize}"`;
  if (c.req.header("if-none-match") === etag) return c.body(null, 304);
  if (!["image/webp", "image/jpeg", "image/png"].includes(a.mimeType)) throw new AppError(415, "unsupported_type", "Bad image");
  return c.body(new Uint8Array(a.data), 200, {
    "Content-Type": a.mimeType,
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  });
});
