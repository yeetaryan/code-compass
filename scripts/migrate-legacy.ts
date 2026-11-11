/**
 * Legacy Supabase → Code Compass (Neon/Postgres) data migration.
 *
 *   npm run legacy:migrate -- --dump ./private/db_cluster.backup.gz --dry-run
 *   npm run legacy:migrate -- --dump ./private/db_cluster.backup.gz --confirm-host ep-xxx.neon.tech
 *
 * - Reads the plain-text dump directly; Supabase internals are never restored.
 * - Additive and idempotent: existing rows (same id or same email) are left untouched, so it can be
 *   re-run against a fresher dump right before cutover.
 * - Writes everything in one transaction; any error rolls back the whole run.
 * - Non-local targets require --confirm-host <hostname> as an explicit approval step.
 * - Every v1 account also gets a legacy_profiles snapshot (used for "Welcome back" + undo + verified manual recovery).
 *   By default snapshots stay "pending": each is filled in when its owner first signs in and shown in Discover
 *   only after the owner confirms it. --publish-profiles restores them all at import instead (v1 visibility as-is).
 * - Re-running with a fresher dump refreshes only snapshots that are still pending; restored profiles are never
 *   overwritten by older data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../server/db/schema.js";
import { copyRows, readDump } from "./legacy/parse-dump.js";
import { plan } from "./legacy/transform.js";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const dumpPath = arg("dump");
const dryRun = flag("dry-run");
const reportDir = arg("report-dir") ?? "./migration-output";
if (!dumpPath) {
  console.error("Usage: legacy:migrate --dump <file.backup[.gz]> [--dry-run] [--publish-profiles] [--confirm-host <host>] [--report-dir dir]");
  process.exit(1);
}

const dump = readDump(dumpPath);
const source = {
  users: copyRows(dump, "auth.users").rows,
  identities: copyRows(dump, "auth.identities").rows,
  profiles: copyRows(dump, "public.profiles").rows,
  teams: copyRows(dump, "public.teams").rows,
};
if (flag("defer-profiles")) console.log("Note: --defer-profiles is now the default.");
const p = plan(source, { publish: flag("publish-profiles"), source: arg("source") ?? "supabase-v1" });

console.log("Source:", { users: source.users.length, identities: source.identities.length, profiles: source.profiles.length, teams: source.teams.length });
console.log("Plan:", p.stats);
if (p.skipped.length) console.log(`Skipped ${p.skipped.length}:`, p.skipped.map((s) => `${s.userId.slice(0, 8)}… ${s.note}`));

mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report: Record<string, unknown> = { startedAt: new Date().toISOString(), dryRun, dump: dumpPath.split("/").pop(), plan: p.stats, issues: p.issues, skipped: p.skipped };

if (dryRun) {
  writeFileSync(`${reportDir}/migration-${stamp}-dry-run.json`, JSON.stringify(report, null, 2));
  console.log(`Dry run only. Report: ${reportDir}/migration-${stamp}-dry-run.json`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const host = new URL(url).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
if (!isLocal && arg("confirm-host") !== host) {
  console.error(`Refusing to write to non-local database "${host}". Re-run with --confirm-host ${host} once you have a backup of the target.`);
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 20_000 });
const db = drizzle(pool, { schema });

const result = await db.transaction(async (tx) => {
  const insertedUsers = await tx
    .insert(schema.users)
    .values(p.users)
    .onConflictDoNothing()
    .returning({ id: schema.users.id });
  const inserted = new Set(insertedUsers.map((u) => u.id));

  // Users already present from a previous run (same id + same email) still get any missing child rows.
  const existing = await tx
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, p.users.map((u) => u.id)));
  const owned = new Set(existing.filter((e) => p.users.find((u) => u.id === e.id)?.email === e.email).map((e) => e.id));
  const emailClashes = p.users.filter((u) => !owned.has(u.id)).map((u) => u.id);

  const accounts = p.accounts.filter((a) => owned.has(a.userId));
  const insAccounts = accounts.length
    ? await tx.insert(schema.accounts).values(accounts).onConflictDoNothing().returning({ id: schema.accounts.id })
    : [];
  const profiles = p.profiles.filter((x) => owned.has(x.userId)) as (typeof schema.profiles.$inferInsert)[];
  const insProfiles = profiles.length
    ? await tx.insert(schema.profiles).values(profiles).onConflictDoNothing().returning({ id: schema.profiles.userId })
    : [];
  const snapshots = p.snapshots.filter((x) => owned.has(x.userId));
  const insSnapshots = snapshots.length
    ? await tx
        .insert(schema.legacyProfiles)
        .values(snapshots)
        .onConflictDoUpdate({
          target: schema.legacyProfiles.userId,
          set: {
            data: sql`excluded.data`,
            raw: sql`excluded.raw`,
            hasProfile: sql`excluded.has_profile`,
            sourceUpdatedAt: sql`excluded.source_updated_at`,
            source: sql`excluded.source`,
            updatedAt: new Date(),
          },
          setWhere: sql`${schema.legacyProfiles.status} = 'pending' AND excluded.source_updated_at > ${schema.legacyProfiles.sourceUpdatedAt}`,
        })
        .returning({ id: schema.legacyProfiles.userId })
    : [];
  const teams = p.teams.filter((t) => owned.has(t.ownerId)) as (typeof schema.teams.$inferInsert)[];
  const insTeams = teams.length ? await tx.insert(schema.teams).values(teams).onConflictDoNothing().returning({ id: schema.teams.id }) : [];
  if (insTeams.length) {
    await tx
      .insert(schema.teamMembers)
      .values(teams.filter((t) => insTeams.some((i) => i.id === t.id)).map((t) => ({ teamId: t.id!, userId: t.ownerId, role: "owner" as const, joinedAt: t.createdAt })))
      .onConflictDoNothing();
  }

  const counts = await tx.execute<{ users: string; accounts: string; profiles: string; teams: string; snapshots: string }>(sql`
    SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM accounts) accounts,
           (SELECT count(*) FROM profiles) profiles, (SELECT count(*) FROM teams) teams,
           (SELECT count(*) FROM legacy_profiles) snapshots`);

  return {
    inserted: { users: inserted.size, accounts: insAccounts.length, profiles: insProfiles.length, teams: insTeams.length },
    snapshotsWritten: insSnapshots.length,
    alreadyPresent: { users: owned.size - inserted.size },
    emailClashes,
    targetTotals: counts.rows[0],
  };
});

report.result = result;
report.finishedAt = new Date().toISOString();
report.target = host;
writeFileSync(`${reportDir}/migration-${stamp}.json`, JSON.stringify(report, null, 2));
console.log("Result:", result);
if (result.emailClashes.length) {
  console.warn(`${result.emailClashes.length} users skipped because their email already belongs to a different account in the target. See report.`);
}
console.log(`Report: ${reportDir}/migration-${stamp}.json`);
await pool.end();
