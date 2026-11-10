/**
 * Read-only export of the four tables the migration needs from a live Supabase database,
 * written in the same plain-text COPY format as a pg_dump file (so migrate-legacy.ts can read it).
 * Needs no pg_dump install. Nothing is written to Supabase.
 *
 *   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres \
 *     npx tsx scripts/export-supabase.ts --out ./private/supabase-fresh.backup.gz
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import pg from "pg";

const TABLES = ["auth.users", "auth.identities", "public.profiles", "public.teams"] as const;

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const out = arg("out");
const url = process.env.SUPABASE_DB_URL;
if (!out || !url) {
  console.error("Usage: SUPABASE_DB_URL=... tsx scripts/export-supabase.ts --out <file.backup.gz>");
  process.exit(1);
}

/** Encode one value exactly as COPY ... TO STDOUT (text format) would. */
const enc = (v: string | null) =>
  v === null ? "\\N" : v.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000 });
await client.connect();
try {
  // A single repeatable-read snapshot so the four tables are consistent with each other.
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  // Same text output as pg_dump: UTC timestamps, ISO dates.
  await client.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL DateStyle = 'ISO, MDY'; SET LOCAL extra_float_digits = 3");
  const parts = [`--\n-- PostgreSQL database dump (Code Compass export-supabase.ts, ${new Date().toISOString()})\n--\n`];
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const [schema, table] = t.split(".");
    const cols = (
      await client.query<{ column_name: string; data_type: string }>(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position",
        [schema, table],
      )
    ).rows;
    if (!cols.length) throw new Error(`table ${t} not found`);
    // ::text matches COPY's text output for every type except boolean (true/false vs t/f).
    const select = cols
      .map((c) => (c.data_type === "boolean" ? `CASE WHEN ${pg.escapeIdentifier(c.column_name)} THEN 't' WHEN NOT ${pg.escapeIdentifier(c.column_name)} THEN 'f' END` : `${pg.escapeIdentifier(c.column_name)}::text`))
      .join(", ");
    const rows = (await client.query({ text: `SELECT ${select} FROM ${schema}.${pg.escapeIdentifier(table)}`, rowMode: "array" })).rows as (string | null)[][];
    counts[t] = rows.length;
    parts.push(`COPY ${t} (${cols.map((c) => c.column_name).join(", ")}) FROM stdin;\n${rows.map((r) => r.map(enc).join("\t")).join("\n")}${rows.length ? "\n" : ""}\\.\n`);
  }
  await client.query("COMMIT");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gzipSync(Buffer.from(parts.join("\n"), "utf8")));
  console.log("Exported (read-only snapshot):", counts);
  console.log(`Wrote ${out}`);
} finally {
  await client.end();
}
