import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError, type ZodType } from "zod";
import { auth, type SessionData } from "../auth.js";
import { NormalizeError } from "../../shared/normalize.js";
import { consume } from "./rate-limit.js";
import { env } from "../env.js";

export type AppEnv = {
  Variables: {
    requestId: string;
    session: SessionData | null;
    user: SessionData["user"] | null;
  };
};

export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 503,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new AppError(404, "not_found", what);
export const forbidden = (msg = "You don't have permission to do that") => new AppError(403, "forbidden", msg);

/** Parse + validate a JSON body. Malformed JSON and schema errors become 400s with field messages. */
export async function body<T extends ZodType>(c: Context, schema: T) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON");
  }
  return schema.parse(raw) as ReturnType<T["parse"]>;
}

export const query = <T extends ZodType>(c: Context, schema: T) => schema.parse(c.req.query()) as ReturnType<T["parse"]>;

export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth().api.getSession({ headers: c.req.raw.headers });
  c.set("session", session);
  c.set("user", session?.user ?? null);
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw new AppError(401, "unauthenticated", "Please sign in to continue");
  await next();
};

export function currentUser(c: Context<AppEnv>) {
  const u = c.get("user");
  if (!u) throw new AppError(401, "unauthenticated", "Please sign in to continue");
  return u;
}

export function clientIp(c: Context) {
  for (const h of env().IP_HEADERS.split(",")) {
    const v = c.req.header(h.trim());
    if (v) return v.split(",")[0].trim();
  }
  return "unknown";
}

/** Per-user (or per-IP when signed out) fixed-window limiter backed by Postgres. */
export function rateLimit(name: string, rule: { window: number; max: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (env().NODE_ENV === "development") return next();
    const who = c.get("user")?.id ?? `ip:${clientIp(c)}`;
    const r = await consume(`api:${name}:${who}`, rule);
    if (!r.allowed) {
      throw new AppError(429, "rate_limited", "You're doing that too often. Please wait a moment and try again.", undefined, {
        "Retry-After": String(r.retryAfter ?? rule.window),
      });
    }
    await next();
  };
}

export function onError(err: Error, c: Context<AppEnv>) {
  const requestId = c.get("requestId");
  if (err instanceof AppError) {
    if (err.headers) for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
    return c.json({ error: { code: err.code, message: err.message, fields: err.fields, requestId } }, err.status);
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) {
      const k = i.path.join(".") || "_";
      fields[k] ??= i.message;
    }
    return c.json({ error: { code: "validation_failed", message: "Please check the highlighted fields", fields, requestId } }, 400);
  }
  if (err instanceof NormalizeError) {
    return c.json({ error: { code: "validation_failed", message: err.message, fields: { [err.field]: err.message }, requestId } }, 400);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: "http_error", message: err.message || "Request failed", requestId } }, err.status);
  }
  const dbDown = isConnectionError(err);
  console.error(`[api] ${requestId} ${c.req.method} ${c.req.path}`, err);
  if (dbDown) {
    c.header("Retry-After", "5");
    return c.json({ error: { code: "db_unavailable", message: "We're having trouble reaching the database. Please try again in a few seconds.", requestId } }, 503);
  }
  return c.json({ error: { code: "internal", message: "Something went wrong on our side. Please try again.", requestId } }, 500);
}

export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: unknown };
  const codes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "57P01", "57P03", "08006", "08001", "08004"];
  if (e?.code && codes.includes(e.code)) return true;
  if (/timeout exceeded when trying to connect|Connection terminated|connect ECONNREFUSED/i.test(e?.message ?? "")) return true;
  return e?.cause ? isConnectionError(e.cause) : false;
}
