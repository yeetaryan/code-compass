/**
 * Pure transformation from the original Supabase rows to the new schema.
 * No I/O here so it can be unit-tested and dry-run.
 */
import { LIMITS } from "../../shared/constants.js";
import { NormalizeError, cleanText, normalizeWhatsapp, normalizeXHandle } from "../../shared/normalize.js";
import { normalizeTags, splitLegacyTags } from "../../shared/tags.js";
import type { Row } from "./parse-dump.js";

export type Issue = { userId: string; field: string; note: string };

export type Planned = {
  users: Array<{ id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date }>;
  accounts: Array<{ id: string; userId: string; accountId: string; providerId: "credential"; password: string; createdAt: Date; updatedAt: Date }>;
  profiles: Array<Record<string, unknown> & { userId: string }>;
  teams: Array<Record<string, unknown> & { id: string; ownerId: string }>;
  issues: Issue[];
  skipped: Issue[];
  stats: Record<string, number>;
};

const ts = (v: string | null) => (v ? new Date(v) : new Date());

export function plan(input: { users: Row[]; identities: Row[]; profiles: Row[]; teams: Row[] }): Planned {
  const out: Planned = { users: [], accounts: [], profiles: [], teams: [], issues: [], skipped: [], stats: {} };
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

    if (!legacyProfile) {
      bump("profiles_created_empty");
      out.issues.push({ userId: id, field: "profile", note: "no profile row in source — created an empty one (user will be onboarded)" });
      out.profiles.push({
        userId: id,
        name,
        discoverable: true,
        onboardedAt: null,
        createdAt: ts(u.created_at),
        updatedAt: ts(u.created_at),
        legacy: { source: "supabase", profile: null },
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
        out.issues.push({ userId: id, field: "whatsapp", note: "invalid number — not migrated to live field (kept in legacy)" });
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
        out.issues.push({ userId: id, field: "twitter", note: "invalid X handle — kept in legacy only" });
      }
    }

    const wasVisibleInBrowse = Boolean(cleanText(legacyProfile.name, 80) && (cleanText(legacyProfile.skills, 9999) || cleanText(legacyProfile.interests, 9999)));
    if (wasVisibleInBrowse) bump("profiles_onboarded");
    else bump("profiles_needing_onboarding");

    out.profiles.push({
      userId: id,
      name,
      yearOfStudy: cleanText(legacyProfile.year, 40),
      skills: skills.labels,
      skillsKey: skills.keys,
      interests: interests.labels,
      interestsKey: interests.keys,
      whatsapp,
      xHandle,
      // Preserve the user's original choices. Columns were nullable with default true.
      whatsappVisible: legacyProfile.whatsapp_visible !== "f",
      xVisible: legacyProfile.twitter_visible !== "f",
      emailVisible: false, // email was never shown in the original app
      discoverable: true,
      onboardedAt: wasVisibleInBrowse ? ts(legacyProfile.updated_at) : null,
      createdAt: ts(legacyProfile.created_at),
      updatedAt: ts(legacyProfile.updated_at),
      legacy: { source: "supabase", profile: legacyProfile },
    });
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
      legacy: { source: "supabase", team: t },
    });
    bump("teams_migrated");
  }

  out.stats.source_users = input.users.length;
  out.stats.source_profiles = input.profiles.length;
  out.stats.source_teams = input.teams.length;
  out.stats.planned_users = out.users.length;
  out.stats.planned_profiles = out.profiles.length;
  out.stats.planned_teams = out.teams.length;
  out.stats.skipped = out.skipped.length;
  return out;
}
