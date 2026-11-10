import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

/**
 * Atomic fixed-window counter in Postgres. One round trip, safe under concurrency,
 * shared across all serverless instances. Used by Better Auth (customStorage) and the app API.
 */
export async function consume(key: string, rule: { window: number; max: number }) {
  const now = Date.now();
  const windowMs = rule.window * 1000;
  const res = await db().execute<{ count: number; window_start: string }>(sql`
    INSERT INTO api_rate_limits (key, count, window_start)
    VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN api_rate_limits.window_start <= ${now - windowMs} THEN 1 ELSE api_rate_limits.count + 1 END,
      window_start = CASE WHEN api_rate_limits.window_start <= ${now - windowMs} THEN ${now} ELSE api_rate_limits.window_start END
    RETURNING count, window_start
  `);
  const row = res.rows[0];
  const count = Number(row.count);
  if (count <= rule.max) return { allowed: true, retryAfter: null };
  const retryAfter = Math.max(1, Math.ceil((Number(row.window_start) + windowMs - now) / 1000));
  return { allowed: false, retryAfter };
}

/** Occasionally prune stale counters so the table stays tiny. */
export async function pruneRateLimits(olderThanMs = 24 * 3600 * 1000) {
  await db().execute(sql`DELETE FROM api_rate_limits WHERE window_start < ${Date.now() - olderThanMs}`);
}
