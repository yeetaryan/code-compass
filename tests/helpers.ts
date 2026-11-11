import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/cc_test";
export const ORIGIN = "http://localhost:5173";

export function setTestEnv() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: TEST_DB,
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
    APP_URL: ORIGIN,
    IP_HEADERS: "x-forwarded-for",
  });
}

export async function resetDatabase() {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await pool.end();
  execFileSync("npx", ["tsx", "scripts/db-migrate.ts"], { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
}

/* ── Synthetic Supabase dump with known passwords ── */
export const LEGACY = {
  six: { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "six@legacy.test", password: "abc123" },
  hidden: { id: "aaaaaaaa-0000-4000-8000-000000000002", email: "hidden@legacy.test", password: "longerpass1", whatsapp: "9876543210" },
  unconfirmed: { id: "aaaaaaaa-0000-4000-8000-000000000003", email: "unconfirmed@legacy.test", password: "unconfirmed1" },
  noprofile: { id: "aaaaaaaa-0000-4000-8000-000000000004", email: "noprofile@legacy.test", password: "noprofile1" },
  /** never confirmed their email in v1, but had a full profile — used for manual recovery into a new account */
  old: { id: "aaaaaaaa-0000-4000-8000-000000000005", email: "old@legacy.test", password: "oldpassword1" },
};
const supabaseHash = (pw: string) => bcrypt.hashSync(pw, 4).replace(/^\$2b\$/, "$2a$");

export function writeFixtureDump(path: string) {
  const T = "2025-07-28 10:00:00.123456+00";
  const users = [
    [LEGACY.six, T],
    [LEGACY.hidden, T],
    [LEGACY.unconfirmed, null],
    [LEGACY.noprofile, T],
    [LEGACY.old, null],
  ] as const;
  const userRows = users.map(([u, confirmed]) =>
    [u.id, u.email, supabaseHash(u.password), confirmed ?? "\\N", JSON.stringify({ name: "Meta " + u.email.split("@")[0] }), T, T, "\\N", "f", "f"].join("\t"),
  );
  const identRows = users.map(([u], i) => [`bbbbbbbb-0000-4000-8000-00000000000${i + 1}`, u.id, "email", T, T].join("\t"));
  const profileRows = [
    [LEGACY.six.id, "Six Legacy", "3rd year", "Js , react , node.js", "Web dev and AI/Ml", "+919999999999", "@sixdev", "t", "t", T, T],
    [LEGACY.hidden.id, "Hidden Contact", "2nd Year", "Python, pytorch", "AI/ML", LEGACY.hidden.whatsapp, "https://x.com/hiddenx", "f", "f", T, T],
    [LEGACY.unconfirmed.id, "Never Confirmed", "\\N", "\\N", "\\N", "\\N", "\\N", "t", "t", T, T],
    [LEGACY.old.id, "Old Timer", "4th year", "Rust, Go", "Systems", "+447700900999", "oldx", "t", "f", T, T],
  ].map((r) => r.join("\t"));
  const dump = `--
-- PostgreSQL database cluster dump
--

COPY auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, deleted_at, is_anonymous, is_sso_user) FROM stdin;
${userRows.join("\n")}
\\.

COPY auth.identities (id, user_id, provider, created_at, updated_at) FROM stdin;
${identRows.join("\n")}
\\.

COPY public.profiles (id, name, year, skills, interests, whatsapp, twitter, whatsapp_visible, twitter_visible, created_at, updated_at) FROM stdin;
${profileRows.join("\n")}
\\.

COPY public.teams (id, user_id, team_name, hackathon_name, needed_skills, timeline, whatsapp_group, description, created_at, updated_at) FROM stdin;
cccccccc-0000-4000-8000-000000000001\t${LEGACY.six.id}\tLegacy Team\tSIH\tReact, Figma\t48 hours\tjavascript:alert(1)\tA legacy team row\t${T}\t${T}
\\.
`;
  mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(path, dump);
}

/* ── Minimal cookie-aware client over app.request() ── */
type App = { request: (input: string, init?: RequestInit) => Response | Promise<Response> };

let ipCounter = 10;
export class Client {
  cookies = new Map<string, string>();
  ip: string;
  constructor(private app: App) {
    this.ip = `10.0.0.${ipCounter++}`;
  }
  async req(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { origin: ORIGIN, "x-forwarded-for": this.ip, ...extra };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload: RequestInit["body"];
    if (body instanceof Uint8Array) payload = body as unknown as RequestInit["body"];
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await this.app.request(`http://localhost${path}`, { method, headers, body: payload });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      const val = v.join("=");
      if (!val || /max-age=0/i.test(c)) this.cookies.delete(k.trim());
      else this.cookies.set(k.trim(), val);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, text, headers: res.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  put = (p: string, b?: unknown) => this.req("PUT", p, b);
  patch = (p: string, b?: unknown) => this.req("PATCH", p, b);
  del = (p: string) => this.req("DELETE", p);

  async signUp(name: string, email: string, password = "password-123") {
    return this.post("/api/auth/sign-up/email", { name, email, password });
  }
  async signIn(email: string, password: string) {
    return this.post("/api/auth/sign-in/email", { email, password });
  }
}

export const fullProfile = (over: Record<string, unknown> = {}) => ({
  name: "Test User",
  bio: null,
  college: "Manipal University Jaipur",
  degree: "B.Tech CSE",
  graduationYear: 2027,
  skills: ["React", "Node.js"],
  interests: ["AI/ML"],
  roles: ["frontend"],
  hackathonInterests: [],
  availability: "looking",
  projects: [],
  preferredContact: null,
  whatsapp: null,
  linkedinUrl: null,
  xHandle: null,
  githubUsername: null,
  websiteUrl: null,
  visibility: { email: false, whatsapp: false, linkedin: true, x: true, github: true, website: true },
  discoverable: true,
  ...over,
});
