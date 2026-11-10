import type { ApiError } from "@shared/api-types";

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch wrapper for /api. Same-origin cookies carry the session.
 * Retries idempotent requests when the database is waking up (Neon scale-to-zero → 503).
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const attempts = method === "GET" ? 3 : 1;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, { ...rest, method, headers, credentials: "same-origin", body: json !== undefined ? JSON.stringify(json) : rest.body });
    } catch {
      if (attempt < attempts) {
        await sleep(600 * attempt);
        continue;
      }
      throw new ApiRequestError(0, "network", "Can't reach Code Compass. Check your connection and try again.");
    }
    if (res.status === 503 && attempt < attempts) {
      await sleep(1200 * attempt);
      continue;
    }
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    let body: ApiError | null = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    throw new ApiRequestError(res.status, body?.error.code ?? "http_error", body?.error.message ?? `Request failed (${res.status})`, body?.error.fields);
  }
}

export const qs = (params: Record<string, string | number | undefined | null | string[]>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    u.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
};
