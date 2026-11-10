import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * One pool per serverless instance (module scope survives warm invocations).
 * Plain `pg` over TCP works with Neon's pooled endpoint and with any other Postgres,
 * which keeps the app portable between providers.
 */
type DB = NodePgDatabase<typeof schema> & { $client: pg.Pool };

const g = globalThis as unknown as { __ccPool?: pg.Pool; __ccDb?: DB };

export function pool(): pg.Pool {
  if (!g.__ccPool) {
    const e = env();
    g.__ccPool = new pg.Pool({
      connectionString: e.DATABASE_URL,
      max: e.DB_POOL_MAX,
      // Neon computes scale to zero; the first connection after idle can take a few seconds.
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
      // TLS comes from the connection string (Neon URLs carry sslmode=require).
    });
    g.__ccPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return g.__ccPool;
}

export function db(): DB {
  if (!g.__ccDb) g.__ccDb = drizzle(pool(), { schema }) as DB;
  return g.__ccDb;
}

export { schema };
