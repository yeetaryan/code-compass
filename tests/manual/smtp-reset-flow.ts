/**
 * Manual end-to-end check of password reset over real SMTP, using a local capture server.
 *   DATABASE_URL=<local db seeded by tests/e2e/seed-fixtures.ts> npx tsx tests/manual/smtp-reset-flow.ts
 */
import { SMTPServer } from "smtp-server";

const inbox: string[] = [];
let sawAuth = "";
const server = new SMTPServer({
  disabledCommands: ["STARTTLS"],
  allowInsecureAuth: true,
  onAuth(auth, _s, cb) {
    sawAuth = `${auth.username}:${auth.password === "app-password" ? "ok" : "BAD"}`;
    cb(null, { user: auth.username });
  },
  onData(stream, _s, cb) {
    let buf = "";
    stream.on("data", (d) => (buf += d.toString()));
    stream.on("end", () => {
      inbox.push(buf);
      cb();
    });
  },
});
await new Promise<void>((r) => server.listen(2525, "127.0.0.1", () => r()));

Object.assign(process.env, {
  NODE_ENV: "development",
  BETTER_AUTH_SECRET: "smtp-test-secret-smtp-test-secret-0000000000",
  APP_URL: "http://localhost:5173",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "2525",
  SMTP_USER: "codecompass.test@gmail.com",
  SMTP_PASS: "app-password",
});
const { createApp } = await import("../../server/app.js");
const app = createApp();
const H = { origin: "http://localhost:5173", "content-type": "application/json" };
const post = (p: string, b: unknown) => app.request(`http://localhost${p}`, { method: "POST", headers: H, body: JSON.stringify(b) });
const email = "aarav@fixtures.invalid";
const waitFor = async (n: number) => {
  for (let i = 0; i < 100 && inbox.length < n; i++) await new Promise((r) => setTimeout(r, 50));
};
const check = (name: string, ok: boolean) => console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);

const cfg = (await (await app.request("http://localhost/api/config")).json()) as { emailEnabled: boolean };
check("config reports email enabled", cfg.emailEnabled === true);

const t0 = Date.now();
const r1 = await post("/api/auth/request-password-reset", { email, redirectTo: "http://localhost:5173/reset-password" });
check(`reset request answered before the email is sent (${r1.status}, ${Date.now() - t0} ms)`, r1.status === 200);
await waitFor(1);
check("mail delivered over SMTP with the configured login", inbox.length === 1 && sawAuth === "codecompass.test@gmail.com:ok");
const raw = inbox[0] ?? "";
check("From header is the Gmail sender", /^From: Code Compass <codecompass\.test@gmail\.com>/m.test(raw));
const flat = raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
const link = flat.match(/http:\/\/localhost:5173\/api\/auth\/reset-password\/[A-Za-z0-9_-]+\?callbackURL=[^\s"<]+/)?.[0];
check("mail contains a reset link", Boolean(link));

const r2 = await app.request(link!.replace("http://localhost:5173", "http://localhost"), { redirect: "manual" });
const loc = r2.headers.get("location") ?? "";
check(`link redirects to the reset page with a token (${r2.status})`, r2.status === 302 && /\/reset-password\?token=/.test(loc));
const token = new URL(loc).searchParams.get("token")!;

const r3 = await post("/api/auth/reset-password", { token, newPassword: "a-brand-new-pass-7" });
check("new password accepted", r3.status === 200);
check("old password rejected", (await post("/api/auth/sign-in/email", { email, password: "fixture-password" })).status === 401);
check("new password signs in", (await post("/api/auth/sign-in/email", { email, password: "a-brand-new-pass-7" })).status === 200);
check("token can't be reused", (await post("/api/auth/reset-password", { token, newPassword: "another-pass-88" })).status !== 200);

const t1 = Date.now();
const r4 = await post("/api/auth/request-password-reset", { email: "nobody@nowhere.test", redirectTo: "http://localhost:5173/reset-password" });
console.log(`      (unknown email answered in ${Date.now() - t1} ms)`);
await new Promise((r) => setTimeout(r, 500));
check("unknown email gets the same 200 and no mail", r4.status === 200 && inbox.length === 1);

// restore the fixture password
const r5 = await post("/api/auth/request-password-reset", { email, redirectTo: "http://localhost:5173/reset-password" });
await waitFor(2);
const t2 = (inbox[1] ?? "").replace(/=\r?\n/g, "").replace(/=3D/g, "=").match(/reset-password\/([A-Za-z0-9_-]+)/)?.[1];
const back = await app.request(`http://localhost/api/auth/reset-password/${t2}?callbackURL=/reset-password`, { redirect: "manual" });
await post("/api/auth/reset-password", { token: new URL(back.headers.get("location")!, "http://x").searchParams.get("token"), newPassword: "fixture-password" });
check("fixture password restored", r5.status === 200 && (await post("/api/auth/sign-in/email", { email, password: "fixture-password" })).status === 200);

server.close();
process.exit(0);
