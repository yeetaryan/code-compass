import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth.js";
import { db } from "./db/client.js";
import { emailConfigured, env, trustedOrigins } from "./env.js";
import { AppError, isConnectionError, onError, sessionMiddleware, type AppEnv } from "./lib/http.js";
import { pruneRateLimits } from "./lib/rate-limit.js";
import { me } from "./routes/me.js";
import { recovery } from "./routes/recovery.js";
import { avatarRoutes, people } from "./routes/people.js";
import { teamRoutes } from "./routes/teams.js";

export const VERSION = "2.0.0";

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use("*", requestId());
  app.use(
    "*",
    secureHeaders({
      // JSON API: nothing should ever be framed or sniffed.
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      crossOriginResourcePolicy: "same-origin",
    }),
  );
  // Same-origin in production (Vercel serves web + API). CORS only matters for extra trusted origins.
  app.use("*", (c, next) =>
    cors({ origin: (origin) => (trustedOrigins().includes(origin) ? origin : null), credentials: true, maxAge: 600 })(c, next),
  );
  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  });

  /* Liveness — no database query, so frequent uptime pings don't keep Neon awake and burn compute hours. */
  app.get("/health/live", (c) => c.json({ status: "ok", version: VERSION, time: new Date().toISOString() }));

  /* Public, non-secret feature flags for the web app. */
  app.get("/config", (c) => {
    const e = env();
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ emailEnabled: emailConfigured(e) || e.NODE_ENV !== "production", supportUrl: e.SUPPORT_URL ?? null });
  });

  /* Readiness — checks DB reachability and latency (wakes a suspended Neon compute). */
  app.get("/health", async (c) => {
    const started = Date.now();
    try {
      await db().execute(sql`SELECT 1`);
      if (Math.random() < 0.02) void pruneRateLimits().catch(() => {});
      return c.json({ status: "ok", version: VERSION, db: { ok: true, latencyMs: Date.now() - started }, time: new Date().toISOString() });
    } catch (err) {
      console.error("[health] database check failed", (err as Error).message);
      return c.json(
        { status: "degraded", version: VERSION, db: { ok: false, latencyMs: Date.now() - started, reason: isConnectionError(err) ? "unreachable" : "error" } },
        503,
      );
    }
  });

  /* Better Auth owns /api/auth/* */
  app.use("/auth/*", bodyLimit({ maxSize: 32 * 1024, onError: () => { throw new AppError(413, "too_large", "Request too large"); } }));
  app.all("/auth/*", (c) => auth().handler(c.req.raw));

  app.use("*", sessionMiddleware);
  app.use("/me/avatar", bodyLimit({ maxSize: 310 * 1024, onError: () => { throw new AppError(413, "too_large", "Images must be under 300 KB"); } }));
  app.use("*", async (c, next) => {
    if (c.req.path === "/api/me/avatar") return next();
    return bodyLimit({ maxSize: 64 * 1024, onError: () => { throw new AppError(413, "too_large", "Request too large"); } })(c, next);
  });

  app.route("/me", me);
  app.route("/people", people);
  app.route("/avatars", avatarRoutes);
  app.route("/teams", teamRoutes);
  app.route("/recovery", recovery);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "No such endpoint", requestId: c.get("requestId") } }, 404));
  app.onError(onError);
  return app;
}
