import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/* ───────────────────────── Better Auth core tables ─────────────────────────
 * JS property names must match Better Auth's field names; column names are snake_case.
 * User ids are text so migrated Supabase UUIDs are preserved verbatim and new ids are UUIDs too.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: tstz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_uidx").on(t.providerId, t.accountId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/* ───────────────────────── Application tables ───────────────────────── */

export const availabilityEnum = pgEnum("availability", ["looking", "open", "busy"]);
export const contactChannelEnum = pgEnum("contact_channel", ["email", "whatsapp", "linkedin", "x", "github", "website"]);
export const teamStatusEnum = pgEnum("team_status", ["recruiting", "full", "closed"]);
export const memberRoleEnum = pgEnum("team_member_role", ["owner", "member"]);
export const requestStatusEnum = pgEnum("join_request_status", ["pending", "accepted", "declined", "withdrawn"]);

export type ProjectItem = { title: string; url: string | null; description: string | null };

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bio: text("bio"),
    college: text("college"),
    degree: text("degree"),
    graduationYear: integer("graduation_year"),
    /** Free-text "year" from the original app, kept verbatim and shown until a graduation year is set. */
    yearOfStudy: text("year_of_study"),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    skillsKey: text("skills_key").array().notNull().default(sql`'{}'::text[]`),
    interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
    interestsKey: text("interests_key").array().notNull().default(sql`'{}'::text[]`),
    roles: text("roles").array().notNull().default(sql`'{}'::text[]`),
    hackathonInterests: text("hackathon_interests").array().notNull().default(sql`'{}'::text[]`),
    availability: availabilityEnum("availability").notNull().default("open"),
    projects: jsonb("projects").$type<ProjectItem[]>().notNull().default(sql`'[]'::jsonb`),
    preferredContact: contactChannelEnum("preferred_contact"),
    whatsapp: text("whatsapp"),
    linkedinUrl: text("linkedin_url"),
    xHandle: text("x_handle"),
    githubUsername: text("github_username"),
    websiteUrl: text("website_url"),
    emailVisible: boolean("email_visible").notNull().default(false),
    whatsappVisible: boolean("whatsapp_visible").notNull().default(false),
    linkedinVisible: boolean("linkedin_visible").notNull().default(true),
    xVisible: boolean("x_visible").notNull().default(true),
    githubVisible: boolean("github_visible").notNull().default(true),
    websiteVisible: boolean("website_visible").notNull().default(true),
    /** Appears in discovery. Owners can opt out without deleting the profile. */
    discoverable: boolean("discoverable").notNull().default(true),
    /** Set once the minimum onboarding fields are present; discovery only lists onboarded profiles. */
    onboardedAt: tstz("onboarded_at"),
    avatarVersion: integer("avatar_version").notNull().default(0),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("profiles_discovery_idx").on(t.onboardedAt, t.discoverable),
    index("profiles_skills_key_gin").using("gin", t.skillsKey),
    index("profiles_interests_key_gin").using("gin", t.interestsKey),
    index("profiles_roles_gin").using("gin", t.roles),
    index("profiles_graduation_year_idx").on(t.graduationYear),
    index("profiles_name_trgm").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
    index("profiles_created_at_idx").on(t.createdAt),
  ],
);

/** Avatars live in their own table so profile queries never load image bytes. */
export const avatars = pgTable("avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  byteSize: integer("byte_size").notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hackathonName: text("hackathon_name"),
    description: text("description").notNull(),
    neededSkills: text("needed_skills").array().notNull().default(sql`'{}'::text[]`),
    neededSkillsKey: text("needed_skills_key").array().notNull().default(sql`'{}'::text[]`),
    neededRoles: text("needed_roles").array().notNull().default(sql`'{}'::text[]`),
    timeline: text("timeline"),
    maxMembers: integer("max_members").notNull().default(4),
    /** Group chat link. Only returned to members. */
    contactLink: text("contact_link"),
    status: teamStatusEnum("status").notNull().default("recruiting"),
    legacy: jsonb("legacy"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("teams_owner_idx").on(t.ownerId),
    index("teams_status_created_idx").on(t.status, t.createdAt),
    index("teams_needed_skills_key_gin").using("gin", t.neededSkillsKey),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    joinedAt: tstz("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const teamJoinRequests = pgTable(
  "team_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message"),
    status: requestStatusEnum("status").notNull().default("pending"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    decidedAt: tstz("decided_at"),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("team_join_requests_one_pending_uidx")
      .on(t.teamId, t.userId)
      .where(sql`${t.status} = 'pending'`),
    index("team_join_requests_user_idx").on(t.userId),
  ],
);

/** Fixed-window counters shared by Better Auth and the app API (works across serverless instances). */
export const apiRateLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
});

/* ───────────────────────── Historical profile recovery ───────────────────────── */

export const recoveryStatusEnum = pgEnum("recovery_status", ["pending", "restored", "dismissed", "claimed", "empty"]);

/** Normalised fields of a v1 (Supabase) profile, as the migration understood them. */
export type SnapshotData = {
  name: string | null;
  yearOfStudy: string | null;
  skills: string[];
  skillsKey: string[];
  interests: string[];
  interestsKey: string[];
  whatsapp: string | null;
  whatsappVisible: boolean;
  xHandle: string | null;
  xVisible: boolean;
};

/**
 * One row per migrated v1 account. Holds the original profile so it can be restored, undone, or (after proving
 * ownership of the old email) moved to a different account. Never returned raw by the API.
 */
export const legacyProfiles = pgTable(
  "legacy_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Email of the v1 account, lower-cased — only used to match a verified manual recovery. */
    sourceEmail: text("source_email").notNull(),
    hasProfile: boolean("has_profile").notNull(),
    data: jsonb("data").$type<SnapshotData>(),
    /** Untouched original Supabase row (audit trail). */
    raw: jsonb("raw"),
    source: text("source").notNull(),
    sourceCreatedAt: tstz("source_created_at"),
    sourceUpdatedAt: tstz("source_updated_at"),
    importedAt: tstz("imported_at").notNull().defaultNow(),
    status: recoveryStatusEnum("status").notNull().default("pending"),
    /** Account the snapshot was applied to (the same account, or another one after a verified manual recovery). */
    restoredTo: text("restored_to").references(() => users.id, { onDelete: "set null" }),
    restoredFields: text("restored_fields").array().notNull().default(sql`'{}'::text[]`),
    restoredVia: text("restored_via"),
    restoredAt: tstz("restored_at"),
    acknowledgedAt: tstz("acknowledged_at"),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("legacy_profiles_source_email_uidx").on(t.sourceEmail), index("legacy_profiles_restored_to_idx").on(t.restoredTo)],
);

/** Email codes for manual recovery into a different account. Codes are stored hashed. */
export const profileRecoveryCodes = pgTable(
  "profile_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    legacyUserId: text("legacy_user_id")
      .notNull()
      .references(() => legacyProfiles.userId, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: tstz("expires_at").notNull(),
    verifiedAt: tstz("verified_at"),
    consumedAt: tstz("consumed_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("profile_recovery_codes_requester_idx").on(t.requesterId, t.createdAt)],
);

/** Audit trail of recovery actions. Never stores passwords, codes or tokens. */
export const profileRecoveryEvents = pgTable(
  "profile_recovery_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    legacyUserId: text("legacy_user_id"),
    event: text("event").notNull(),
    detail: jsonb("detail"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("profile_recovery_events_user_idx").on(t.userId, t.createdAt)],
);
