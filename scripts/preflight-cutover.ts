/**
 * Read-only checks before importing v1 users into a database. Prints counts only (no emails).
 *   DATABASE_URL=<target> tsx scripts/preflight-cutover.ts --dump <fresh.backup.gz> [--allow-pending-schema]
 * Exit code 1 if anything would block or silently skip part of the import:
 *   - the schema isn't fully migrated (only a note with --allow-pending-schema, i.e. before the cutover migrates it)
 *   - a target account uses the email of a v1 account but has a different id (that v1 account would be skipped)
 */
import pg from "pg";
import { readdirSync } from "node:fs";
import { copyRows, readDump } from "./legacy/parse-dump.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const dumpPath = arg("dump");
const url = process.env.DATABASE_URL;
if (!dumpPath || !url) {
  console.error("Usage: DATABASE_URL=... tsx scripts/preflight-cutover.ts --dump <file>");
  process.exit(2);
}

const src = copyRows(readDump(dumpPath), "auth.users").rows.map((u) => ({ id: u.id!, email: u.email!.toLowerCase() }));
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 20_000 });
const problems: string[] = [];
try {
  const migrations = Number((await pool.query("SELECT count(*) n FROM drizzle.__drizzle_migrations")).rows[0].n);
  const expected = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length;
  const target = (await pool.query<{ id: string; email: string }>("SELECT id, lower(email) email FROM users")).rows;
  const byEmail = new Map(target.map((t) => [t.email, t.id]));
  const ids = new Set(target.map((t) => t.id));
  const clashes = src.filter((s) => byEmail.has(s.email) && byEmail.get(s.email) !== s.id).length;
  const already = src.filter((s) => ids.has(s.id)).length;
  console.log({ sourceUsers: src.length, targetUsers: target.length, alreadyImported: already, emailClashes: clashes, migrations, expectedMigrations: expected });
  if (migrations < expected) {
    if (process.argv.includes("--allow-pending-schema")) console.log(`NOTE  schema has ${migrations}/${expected} migrations — the cutover applies the rest`);
    else problems.push(`schema has ${migrations}/${expected} migrations — run db:migrate first`);
  }
  if (clashes) problems.push(`${clashes} target account(s) use the email of a v1 account with a different id — delete those test accounts first, or those v1 users won't be imported`);
} finally {
  await pool.end();
}
if (problems.length) {
  for (const p of problems) console.log(`BLOCKED  ${p}`);
  process.exit(1);
}
console.log("Preflight OK");
