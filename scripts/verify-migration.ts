/**
 * Verifies a completed legacy migration against the original dump.
 *
 *   npm run legacy:verify -- --dump ./private/db_cluster.backup.gz
 *   npm run legacy:verify -- --dump … --login-email you@x.com --login-password '…'   (optional real sign-in check)
 *
 * Exit code 0 = every check passed, 1 = at least one failure (details printed).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { copyRows, readDump } from "./legacy/parse-dump.js";
import { PUBLIC_PROFILE_COLUMNS } from "../server/lib/profile-view.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const dumpPath = arg("dump");
if (!dumpPath) throw new Error("--dump is required");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const dump = readDump(dumpPath);
const srcUsers = copyRows(dump, "auth.users").rows;
const srcProfiles = copyRows(dump, "public.profiles").rows;
const srcTeams = copyRows(dump, "public.teams").rows;

const pool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 20_000 });
const db = drizzle(pool);
const results: { check: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push({ check: name, ok, detail });
const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => (await db.execute<T>(s)).rows;

// 1. Users: ids, emails, verification state and password hashes preserved exactly
const tUsers = await q<{ id: string; email: string; email_verified: boolean; created_at: Date; password: string | null }>(sql`
  SELECT u.id, u.email, u.email_verified, u.created_at, a.password
  FROM users u LEFT JOIN accounts a ON a.user_id = u.id AND a.provider_id = 'credential'`);
const byId = new Map(tUsers.map((u) => [u.id, u]));
let missing = 0, emailMismatch = 0, verifiedMismatch = 0, hashMismatch = 0, tsMismatch = 0;
for (const s of srcUsers) {
  const t = byId.get(s.id!);
  if (!t) { missing++; continue; }
  if (t.email !== s.email!.toLowerCase()) emailMismatch++;
  if (t.email_verified !== Boolean(s.email_confirmed_at)) verifiedMismatch++;
  if (t.password !== s.encrypted_password) hashMismatch++;
  // Postgres keeps microseconds, JS Dates keep milliseconds — compare at ms precision.
  if (Math.abs(new Date(t.created_at).getTime() - new Date(s.created_at!).getTime()) >= 1) tsMismatch++;
}
check("every source user exists with the same id", missing === 0, `${srcUsers.length - missing}/${srcUsers.length}`);
check("emails preserved", emailMismatch === 0, `${emailMismatch} mismatches`);
check("email verification state preserved", verifiedMismatch === 0, `${verifiedMismatch} mismatches`);
check("bcrypt password hashes preserved byte-for-byte", hashMismatch === 0, `${hashMismatch} mismatches`);
check("signup timestamps preserved (ms precision)", tsMismatch === 0, `${tsMismatch} mismatches`);

// 2. Profiles
const tProfiles = await q<{ user_id: string; whatsapp_visible: boolean; x_visible: boolean; created_at: Date; legacy: unknown }>(sql`
  SELECT user_id, whatsapp_visible, x_visible, created_at, legacy FROM profiles`);
const pById = new Map(tProfiles.map((p) => [p.user_id, p]));
let pMissing = 0, visMismatch = 0, pTs = 0, legacyMissing = 0;
for (const s of srcProfiles) {
  const t = pById.get(s.id!);
  if (!t) { pMissing++; continue; }
  if (t.whatsapp_visible !== (s.whatsapp_visible !== "f") || t.x_visible !== (s.twitter_visible !== "f")) visMismatch++;
  if (Math.abs(new Date(t.created_at).getTime() - new Date(s.created_at!).getTime()) >= 1) pTs++;
  if (!t.legacy) legacyMissing++;
}
check("every source profile migrated", pMissing === 0, `${srcProfiles.length - pMissing}/${srcProfiles.length}`);
check("visibility choices preserved", visMismatch === 0, `${visMismatch} mismatches`);
check("profile timestamps preserved", pTs === 0, `${pTs} mismatches`);
check("original rows kept in profiles.legacy", legacyMissing === 0, `${legacyMissing} missing`);
const usersWithoutProfile = await q<{ n: string }>(sql`SELECT count(*) n FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE p.user_id IS NULL`);
check("every user has a profile row", Number(usersWithoutProfile[0].n) === 0, `${usersWithoutProfile[0].n} without`);

// 3. Teams
const tTeams = await q<{ n: string }>(sql`SELECT count(*) n FROM teams WHERE legacy IS NOT NULL`);
check("legacy teams migrated", Number(tTeams[0].n) === srcTeams.length, `${tTeams[0].n}/${srcTeams.length}`);
const teamsWithoutOwnerMember = await q<{ n: string }>(sql`
  SELECT count(*) n FROM teams t WHERE NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = t.owner_id AND m.role = 'owner')`);
check("every team has its owner as a member", Number(teamsWithoutOwnerMember[0].n) === 0);

// 4. Referential integrity + constraints/indexes present
const fks = await q<{ conname: string }>(sql`SELECT conname FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
check("foreign keys present", fks.length >= 10, `${fks.length} FKs`);
const orphans = await q<{ n: string }>(sql`
  SELECT (SELECT count(*) FROM accounts a LEFT JOIN users u ON u.id = a.user_id WHERE u.id IS NULL)
       + (SELECT count(*) FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL)
       + (SELECT count(*) FROM team_members m LEFT JOIN teams t ON t.id = m.team_id WHERE t.id IS NULL) AS n`);
check("no orphaned rows", Number(orphans[0].n) === 0, `${orphans[0].n} orphans`);
const idx = await q<{ indexname: string }>(sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
const needed = ["profiles_skills_key_gin", "profiles_interests_key_gin", "profiles_roles_gin", "profiles_name_trgm", "profiles_discovery_idx", "teams_status_created_idx"];
const missingIdx = needed.filter((n) => !idx.some((i) => i.indexname === n));
check("search indexes present", missingIdx.length === 0, missingIdx.join(", ") || `${idx.length} indexes`);

// 5. Privacy: hidden contact details must not come out of the public projection
const leaks = await q<{ n: string }>(sql`
  SELECT count(*) n FROM (SELECT ${PUBLIC_PROFILE_COLUMNS}, p.whatsapp_visible, p.x_visible, p.email_visible
                          FROM profiles p JOIN users u ON u.id = p.user_id) v
  WHERE (NOT v.whatsapp_visible AND v.whatsapp IS NOT NULL) OR (NOT v.x_visible AND v.x_handle IS NOT NULL)
     OR (NOT v.email_visible AND v.email IS NOT NULL)`);
check("hidden contacts never exposed by the public projection", Number(leaks[0].n) === 0, `${leaks[0].n} leaks`);

// 6. Optional: a real sign-in through Better Auth with a migrated account
const email = arg("login-email");
const password = arg("login-password");
if (email && password) {
  const { auth } = await import("../server/auth.js");
  try {
    const r = await auth().api.signInEmail({ body: { email, password } });
    check("migrated account can sign in with its original password", Boolean(r?.user?.id));
  } catch (e) {
    check("migrated account can sign in with its original password", false, (e as Error).message);
  }
}

await pool.end();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check}${r.detail ? `  (${r.detail})` : ""}`);
console.log(failed.length ? `\n${failed.length} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
