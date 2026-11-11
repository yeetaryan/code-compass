/**
 * Removes the fictional demo accounts that older versions seeded into a development database
 * (emails @demo.codecompass.dev, plus test fixtures @fixtures.invalid). Nothing else is touched.
 * Deleting an account also removes its profile, avatar, owned teams and memberships (FK cascades).
 *
 *   DATABASE_URL=<dev db> tsx scripts/remove-demo-accounts.ts --confirm-host <exact db hostname> [--dry-run]
 *
 * Guard rails: non-local hosts need --confirm-host; refuses a database that holds imported v1 accounts
 * (legacy_profiles rows), because that's production data.
 */
import pg from "pg";

const DEMO = /@(demo\.codecompass\.dev|fixtures\.invalid)$/i;
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host) && arg("confirm-host") !== host) {
  console.error(`Refusing: pass --confirm-host ${host} to confirm this is the database you mean.`);
  process.exit(2);
}
const dryRun = process.argv.includes("--dry-run");
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const legacy = await pool.query("SELECT to_regclass('public.legacy_profiles') IS NOT NULL AS has");
  if (legacy.rows[0].has && Number((await pool.query("SELECT count(*) n FROM legacy_profiles")).rows[0].n) > 0) {
    console.error("Refusing: this database holds imported v1 accounts (legacy_profiles) — it looks like production.");
    process.exit(2);
  }
  const users = (await pool.query<{ id: string; email: string }>("SELECT id, email FROM users")).rows;
  const demo = users.filter((u) => DEMO.test(u.email));
  console.log({ host, totalAccounts: users.length, demoAccounts: demo.length, otherAccountsKept: users.length - demo.length, dryRun });
  if (!dryRun && demo.length) {
    await pool.query("BEGIN");
    const r = await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [demo.map((d) => d.id)]);
    await pool.query("COMMIT");
    console.log(`Removed ${r.rowCount} demo account(s) and everything they owned.`);
  }
} finally {
  await pool.end();
}
