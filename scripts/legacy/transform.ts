/**
 * Pure transformation from the original Supabase rows to the new schema.
 * No I/O here so it can be unit-tested and dry-run.
 */
import { LIMITS } from "../../shared/constants.js";
import { NormalizeError, cleanText, normalizeWhatsapp, normalizeXHandle } from "../../shared/normalize.js";
import { normalizeTags, splitLegacyTags } from "../../shared/tags.js";
import type { SnapshotData } from "../../server/db/schema.js";
import { meaningfulFields, mergeSnapshot, type LiveProfile } from "../../server/lib/recovery-merge.js";
import type { Row } from "./parse-dump.js";

export type Issue = { userId: string; field: string; note: string };

export type Planned = {
  users: Array<{ id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date }>;
  accounts: Array<{ id: string; userId: string; accountId: string; providerId: "credential"; password: string; createdAt: Date; updatedAt: Date }>;
  profiles: Array<Record<string, unknown> & { userId: string }>;
  teams: Array<Record<string, unknown> & { id: string; ownerId: string }>;
  snapshots: Array<{
    userId: string;
    sourceEmail: string;
    hasProfile: boolean;
    data: SnapshotData | null;
    raw: unknown;
    source: string;
    sourceCreatedAt: Date | null;
    sourceUpdatedAt: Date | null;
    status: "pending" | "restored" | "empty";
    restoredTo: string | null;
    restoredFields: string[];
    restoredVia: string | null;
    restoredAt: Date | null;
  }>;
  issues: Issue[];
  skipped: Issue[];
  stats: Record<string, number>;
};

const ts = (v: string | null) => (v ? new Date(v) : new Date());

/**
 * @param publish  true (default): restore each v1 profile into the live profile now, so it appears in Discover at
 *                 launch exactly as in v1. false: import snapshots as "pending"; each one is restored automatically
 *                 the first time its owner signs in.
 */
export function plan(input: { users: Row[]; identities: Row[]; profiles: Row[]; teams: Row[] }, opts: { publish?: boolean; source?: string } = {}): Planned {
  const publish = opts.publish ?? true;
  const source = opts.source ?? "supabase-v1";
  const importedAt = new Date();
  const out: Planned = { users: [], accounts: [], profiles: [], teams: [], snapshots: [], issues: [], skipped: [], stats: {} };
  const bump = (k: string, n = 1) => (out.stats[k] = (out.stats[k] ?? 0) + n);
  const profileById = new Map(input.profiles.map((p) => [p.id!, p]));
  const identityByUser = new Map(input.identities.filter((i) => i.provider === "email").map((i) => [i.user_id!, i]));
  const migratedIds = new Set<string>();
  const seenEmails = new Set<string>();

  for (const u of input.users) {
    const id = u.id!;
    const email = (u.email ?? "").trim().toLowerCase();
    if (!email) {
      out.skipped.push({ userId: id, field: "email", note: "no email address" });
      continue;
    }
    if (u.deleted_at) {
      out.skipped.push({ userId: id, field: "deleted_at", note: "deleted in Supabase" });
      continue;
    }
    if (u.is_anonymous === "t" || u.is_sso_user === "t") {
      out.skipped.push({ userId: id, field: "provider", note: "anonymous/SSO user" });
      continue;
    }
    if (seenEmails.has(email)) {
      out.skipped.push({ userId: id, field: "email", note: "duplicate email in source" });
      continue;
    }
    if (!u.encrypted_password || !/^\$2[aby]\$\d{2}\$.{53}$/.test(u.encrypted_password)) {
      out.skipped.push({ userId: id, field: "encrypted_password", note: "missing or non-bcrypt hash" });
      continue;
    }
    seenEmails.add(email);
    migratedIds.add(id);

    const legacyProfile = profileById.get(id);
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(u.raw_user_meta_data ?? "{}");
    } catch {
      /* ignore */
    }
    const name =
      cleanText(legacyProfile?.name, LIMITS.name) ?? cleanText(typeof meta.name === "string" ? meta.name : null, LIMITS.name) ?? email.split("@")[0];

    out.users.push({
      id,
      name,
      email,
      emailVerified: Boolean(u.email_confirmed_at),
      createdAt: ts(u.created_at),
      updatedAt: ts(u.updated_at),
    });
    bump(u.email_confirmed_at ? "users_verified" : "users_unverified");

    const identity = identityByUser.get(id);
    out.accounts.push({
      id: identity?.id ?? crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: u.encrypted_password,
      createdAt: ts(identity?.created_at ?? u.created_at),
      updatedAt: ts(identity?.updated_at ?? u.updated_at),
    });

    const minimalLive = (createdAt: Date, updatedAt: Date) => ({
      userId: id,
      name,
      discoverable: true,
      onboardedAt: null as Date | null,
      emailVisible: false, // email was never shown in the original app
      createdAt,
      updatedAt,
    });

    if (!legacyProfile) {
      bump("profiles_created_empty");
      out.issues.push({ userId: id, field: "profile", note: "no profile row in source — created an empty one (user will be onboarded)" });
      out.profiles.push(minimalLive(ts(u.created_at), ts(u.created_at)));
      out.snapshots.push({
        userId: id, sourceEmail: email, hasProfile: false, data: null, raw: null, source,
        sourceCreatedAt: null, sourceUpdatedAt: null, status: "empty", restoredTo: null, restoredFields: [], restoredVia: null, restoredAt: null,
      });
      continue;
    }

    // tags
    const skillSplit = splitLegacyTags(legacyProfile.skills);
    const interestSplit = splitLegacyTags(legacyProfile.interests);
    const skills = normalizeTags(skillSplit.tags, LIMITS.skills);
    const interests = normalizeTags(interestSplit.tags, LIMITS.interests);
    for (const d of [...skillSplit.dropped, ...interestSplit.dropped]) {
      bump("tags_dropped_too_long");
      out.issues.push({ userId: id, field: "tags", note: `kept only in legacy (>${LIMITS.tag} chars): ${d.length} chars` });
    }
    if (skillSplit.tags.length > LIMITS.skills) bump("skills_truncated");

    // contacts
    let whatsapp: string | null = null;
    if (cleanText(legacyProfile.whatsapp, 40)) {
      try {
        whatsapp = normalizeWhatsapp(legacyProfile.whatsapp);
        bump(legacyProfile.whatsapp!.trim().startsWith("+") ? "whatsapp_e164_kept" : "whatsapp_prefixed_91");
      } catch (e) {
        if (!(e instanceof NormalizeError)) throw e;
        bump("whatsapp_invalid");
        out.issues.push({ userId: id, field: "whatsapp", note: "invalid number — not restored (kept in legacy_profiles.raw)" });
      }
    }
    let xHandle: string | null = null;
    if (cleanText(legacyProfile.twitter, 300)) {
      try {
        xHandle = normalizeXHandle(legacyProfile.twitter);
        bump("x_handle_migrated");
      } catch (e) {
        if (!(e instanceof NormalizeError)) throw e;
        bump("x_handle_invalid");
        out.issues.push({ userId: id, field: "twitter", note: "invalid X handle — kept in legacy_profiles.raw only" });
      }
    }

    const data: SnapshotData = {
      name: cleanText(legacyProfile.name, LIMITS.name),
      yearOfStudy: cleanText(legacyProfile.year, 40),
      skills: skills.labels,
      skillsKey: skills.keys,
      interests: interests.labels,
      interestsKey: interests.keys,
      whatsapp,
      // Preserve the user's original choices. Columns were nullable with default true.
      whatsappVisible: legacyProfile.whatsapp_visible !== "f",
      xHandle,
      xVisible: legacyProfile.twitter_visible !== "f",
    };
    const sourceCreatedAt = ts(legacyProfile.created_at);
    const sourceUpdatedAt = ts(legacyProfile.updated_at);
    const live = minimalLive(sourceCreatedAt, sourceUpdatedAt);
    const hasInfo = meaningfulFields(data).length > 0;
    let restored: { patch: Partial<LiveProfile>; fields: string[] } = { patch: {}, fields: [] };
    if (publish && hasInfo) {
      const empty: LiveProfile = {
        name: live.name, yearOfStudy: null, skills: [], skillsKey: [], interests: [], interestsKey: [], roles: [],
        whatsapp: null, whatsappVisible: false, xHandle: null, xVisible: true, onboardedAt: null,
      };
      restored = mergeSnapshot(empty, data, sourceUpdatedAt);
    }
    out.profiles.push({ ...live, ...restored.patch });
    out.snapshots.push({
      userId: id, sourceEmail: email, hasProfile: true, data, raw: legacyProfile, source, sourceCreatedAt, sourceUpdatedAt,
      status: !hasInfo ? "empty" : publish ? "restored" : "pending",
      restoredTo: publish && hasInfo ? id : null,
      restoredFields: restored.fields,
      restoredVia: publish && hasInfo ? "import" : null,
      restoredAt: publish && hasInfo ? importedAt : null,
    });
    bump(restored.patch.onboardedAt ? "profiles_onboarded" : "profiles_needing_onboarding");
    bump(hasInfo ? (publish ? "snapshots_restored_at_import" : "snapshots_pending") : "snapshots_empty");
    bump("profiles_migrated");
  }

  for (const p of input.profiles) {
    if (!migratedIds.has(p.id!)) {
      out.skipped.push({ userId: p.id!, field: "profile", note: "profile without a migrated user" });
    }
  }

  for (const t of input.teams) {
    if (!migratedIds.has(t.user_id!)) {
      out.skipped.push({ userId: t.user_id!, field: "team", note: `team ${t.id} has no migrated owner` });
      continue;
    }
    const needed = normalizeTags(splitLegacyTags(t.needed_skills).tags, LIMITS.skills);
    let contactLink: string | null = null;
    const rawLink = cleanText(t.whatsapp_group, 300);
    if (rawLink && /^https:\/\//i.test(rawLink)) contactLink = rawLink;
    else if (rawLink) out.issues.push({ userId: t.user_id!, field: "team.whatsapp_group", note: "non-https link dropped" });
    out.teams.push({
      id: t.id!,
      ownerId: t.user_id!,
      name: cleanText(t.team_name, LIMITS.teamName) ?? "Untitled team",
      hackathonName: cleanText(t.hackathon_name, 120),
      description: cleanText(t.description, LIMITS.teamDescription) ?? "",
      neededSkills: needed.labels,
      neededSkillsKey: needed.keys,
      timeline: cleanText(t.timeline, 80),
      contactLink,
      createdAt: ts(t.created_at),
      updatedAt: ts(t.updated_at),
      legacy: { source, team: t },
    });
    bump("teams_migrated");
  }

  out.stats.source_users = input.users.length;
  out.stats.source_profiles = input.profiles.length;
  out.stats.source_teams = input.teams.length;
  out.stats.planned_users = out.users.length;
  out.stats.planned_profiles = out.profiles.length;
  out.stats.planned_teams = out.teams.length;
  out.stats.planned_snapshots = out.snapshots.length;
  out.stats.skipped = out.skipped.length;
  return out;
}
