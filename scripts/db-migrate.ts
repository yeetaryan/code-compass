/**
 * Applies pending SQL migrations from ./drizzle to DATABASE_URL.
 * Safe to run repeatedly; drizzle records applied migrations in drizzle.__drizzle_migrations.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 20_000 });
const host = new URL(url).hostname;
console.log(`Applying migrations to ${host} …`);
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log("Migrations up to date.");
await pool.end();
