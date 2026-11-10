/**
 * API integration tests against a real Postgres (cc_test by default; override with TEST_DATABASE_URL).
 * Run: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { Client, LEGACY, TEST_DB, fullProfile, resetDatabase, setTestEnv, writeFixtureDump } from "./helpers.js";

setTestEnv();
const { createApp } = await import("../server/app.js");
const { testOutbox } = await import("../server/lib/mailer.js");
const { pool } = await import("../server/db/client.js");
const app = createApp();
const FIXTURE = "./migration-output/test-fixture.backup";

before(async () => {
  await resetDatabase();
  writeFixtureDump(FIXTURE);
  execFileSync("npx", ["tsx", "scripts/migrate-legacy.ts", "--dump", FIXTURE, "--report-dir", "./migration-output/test"], {
    env: { ...process.env, DATABASE_URL: TEST_DB },
    stdio: "pipe",
  });
});
after(async () => {
  await pool().end();
});

describe("legacy migration", () => {
  it("verify script passes against the fixture", () => {
    const out = execFileSync("npx", ["tsx", "scripts/verify-migration.ts", "--dump", FIXTURE, "--login-email", LEGACY.six.email, "--login-password", LEGACY.six.password], {
      env: { ...process.env, DATABASE_URL: TEST_DB },
    }).toString();
    assert.match(out, /All \d+ checks passed/);
    assert.match(out, /PASS {2}migrated account can sign in/);
  });

  it("is idempotent", () => {
    const out = execFileSync("npx", ["tsx", "scripts/migrate-legacy.ts", "--dump", FIXTURE, "--report-dir", "./migration-output/test"], {
      env: { ...process.env, DATABASE_URL: TEST_DB },
    }).toString();
    assert.match(out, /inserted: \{ users: 0, accounts: 0, profiles: 0, teams: 0 \}/);
  });

  it("drops unsafe legacy team links and normalises data", async () => {
    const r = await pool().query("SELECT contact_link, needed_skills FROM teams WHERE id = 'cccccccc-0000-4000-8000-000000000001'");
    assert.equal(r.rows[0].contact_link, null, "javascript: URL must not be migrated");
    assert.deepEqual(r.rows[0].needed_skills, ["React", "Figma"]);
    const p = await pool().query("SELECT skills, interests, whatsapp, x_handle, onboarded_at FROM profiles WHERE user_id = $1", [LEGACY.six.id]);
    assert.deepEqual(p.rows[0].skills, ["JavaScript", "React", "Node.js"]);
    assert.deepEqual(p.rows[0].interests, ["Web Development", "AI/ML"]);
    assert.equal(p.rows[0].x_handle, "sixdev");
    assert.ok(p.rows[0].onboarded_at);
    const h = await pool().query("SELECT whatsapp, x_handle FROM profiles WHERE user_id = $1", [LEGACY.hidden.id]);
    assert.equal(h.rows[0].whatsapp, "+919876543210");
    assert.equal(h.rows[0].x_handle, "hiddenx");
  });
});

describe("authentication", () => {
  it("migrated users sign in with their original (6-char) Supabase password", async () => {
    const c = new Client(app);
    const r = await c.signIn(LEGACY.six.email, LEGACY.six.password);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.user.id, LEGACY.six.id, "user id preserved");
    const me = await c.get("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.json.profile.name, "Six Legacy");
  });

  it("rejects wrong passwords with a generic message", async () => {
    const r = await new Client(app).signIn(LEGACY.six.email, "not-it");
    assert.equal(r.status, 401);
    assert.doesNotMatch(r.text, /hash|bcrypt|sql/i);
  });

  it("legacy user without a profile row gets one and lands in onboarding", async () => {
    const c = new Client(app);
    assert.equal((await c.signIn(LEGACY.noprofile.email, LEGACY.noprofile.password)).status, 200);
    const me = await c.get("/api/me");
    assert.equal(me.json.profile.onboarded, false);
  });

  it("sign up → session persists → sign out", async () => {
    const c = new Client(app);
    const s = await c.signUp("New Person", "new@person.test");
    assert.equal(s.status, 200, s.text);
    assert.equal((await c.get("/api/me")).status, 200);
    const session = await c.get("/api/auth/get-session");
    assert.equal(session.json.user.email, "new@person.test");
    await c.post("/api/auth/sign-out");
    assert.equal((await c.get("/api/me")).status, 401);
  });

  it("rejects duplicate emails, short passwords and bad emails", async () => {
    const c = new Client(app);
    assert.notEqual((await c.signUp("Dup", LEGACY.six.email)).status, 200);
    assert.equal((await c.signUp("Short", "short@x.test", "1234567")).status, 400);
    assert.equal((await c.signUp("Bad", "not-an-email")).status, 400);
  });

  it("password reset: request → email → reset → old password stops working", async () => {
    const c = new Client(app);
    const before = testOutbox.length;
    const r = await c.post("/api/auth/request-password-reset", { email: LEGACY.hidden.email, redirectTo: "http://localhost:5173/reset-password" });
    assert.equal(r.status, 200, r.text);
    for (let i = 0; i < 50 && testOutbox.length === before; i++) await new Promise((res) => setTimeout(res, 20));
    const mail = testOutbox.at(-1)!;
    assert.equal(mail.to, LEGACY.hidden.email);
    const link = mail.text.match(/https?:\/\/\S+/)![0];
    const token = new URL(link).pathname.split("/").pop()!;
    const reset = await c.post("/api/auth/reset-password", { token, newPassword: "brand-new-pass-1" });
    assert.equal(reset.status, 200, reset.text);
    assert.equal((await new Client(app).signIn(LEGACY.hidden.email, LEGACY.hidden.password)).status, 401);
    assert.equal((await new Client(app).signIn(LEGACY.hidden.email, "brand-new-pass-1")).status, 200);
    LEGACY.hidden.password = "brand-new-pass-1";
  });

  it("reset request for an unknown email looks identical (no account enumeration)", async () => {
    const r = await new Client(app).post("/api/auth/request-password-reset", { email: "nobody@nowhere.test", redirectTo: "http://localhost:5173/reset-password" });
    assert.equal(r.status, 200);
  });

  it("rate limits repeated sign-in attempts", async () => {
    const c = new Client(app);
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await c.signIn(LEGACY.six.email, "wrong-password");
      if (r.status === 429) limited = true;
    }
    assert.ok(limited, "expected a 429 after repeated failures");
  });
});

describe("profiles + privacy", () => {
  const alice = new Client(app);
  const bob = new Client(app);

  before(async () => {
    await alice.signUp("Alice", "alice@test.dev");
    await bob.signUp("Bob", "bob@test.dev");
  });

  it("requires auth", async () => {
    assert.equal((await new Client(app).get("/api/me")).status, 401);
    assert.equal((await new Client(app).get("/api/people")).status, 401);
  });

  it("onboarding validates and marks the profile discoverable", async () => {
    const bad = await alice.post("/api/me/onboarding", { name: "A", skills: [], roles: [], availability: "looking" });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.error.fields);
    const ok = await alice.post("/api/me/onboarding", { name: "Alice Doe", college: "MUJ", graduationYear: 2027, skills: ["react", "ts"], roles: ["frontend"], availability: "looking" });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.profile.onboarded, true);
    assert.deepEqual(ok.json.profile.skills, ["React", "TypeScript"]);
  });

  it("normalises LinkedIn and X independently and rejects bad links", async () => {
    const r = await alice.put("/api/me/profile", fullProfile({
      name: "Alice Doe",
      linkedinUrl: "in.linkedin.com/in/alice-doe/?trk=abc",
      xHandle: "https://twitter.com/alice_x",
      whatsapp: "+44 7700 900123",
      visibility: { email: false, whatsapp: false, linkedin: true, x: false, github: true, website: true },
    }));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.profile.linkedinUrl, "https://www.linkedin.com/in/alice-doe");
    assert.equal(r.json.profile.xHandle, "alice_x");
    assert.equal(r.json.profile.whatsapp, "+447700900123");
    for (const linkedinUrl of ["https://evil.com/in/alice", "linkedin.com/company/acme", "javascript:alert(1)"]) {
      const bad = await alice.put("/api/me/profile", fullProfile({ name: "Alice Doe", linkedinUrl }));
      assert.equal(bad.status, 400, linkedinUrl);
      assert.ok(bad.json.error.fields.linkedinUrl);
    }
    const badSite = await alice.put("/api/me/profile", fullProfile({ name: "Alice Doe", websiteUrl: "javascript:alert(1)" }));
    assert.equal(badSite.status, 400);
  });

  it("rejects unknown fields (no mass-assignment)", async () => {
    const r = await alice.put("/api/me/profile", { ...fullProfile({ name: "Alice Doe" }), onboardedAt: null, userId: "x" });
    assert.equal(r.status, 400);
  });

  it("hidden contact details never reach other users", async () => {
    // Alice keeps WhatsApp + X hidden, LinkedIn visible
    await alice.put("/api/me/profile", fullProfile({
      name: "Alice Doe",
      linkedinUrl: "linkedin.com/in/alice-doe",
      xHandle: "alice_x",
      whatsapp: "+447700900123",
      visibility: { email: false, whatsapp: false, linkedin: true, x: false, github: true, website: true },
    }));
    await bob.post("/api/me/onboarding", { name: "Bob Ray", skills: ["Figma"], roles: ["design"], availability: "open" });
    const me = await alice.get("/api/me");
    const list = await bob.get("/api/people?q=alice");
    assert.equal(list.status, 200);
    const card = list.json.items.find((p: any) => p.id === me.json.user.id);
    assert.ok(card, "alice should be discoverable");
    assert.deepEqual(card.contacts.map((x: any) => x.channel), ["linkedin"]);
    const detail = await bob.get(`/api/people/${me.json.user.id}`);
    for (const secret of ["7700900123", "alice_x", "alice@test.dev"]) {
      assert.ok(!list.text.includes(secret), `list leaked ${secret}`);
      assert.ok(!detail.text.includes(secret), `detail leaked ${secret}`);
    }
    // migrated hidden user (WhatsApp/X hidden in Supabase) stays hidden
    const legacy = await bob.get(`/api/people/${LEGACY.hidden.id}`);
    assert.equal(legacy.status, 200);
    assert.ok(!legacy.text.includes("9876543210") && !legacy.text.includes("hiddenx"));
  });

  it("visible contacts are returned with safe hrefs; email only when opted in", async () => {
    await alice.put("/api/me/profile", fullProfile({
      name: "Alice Doe", whatsapp: "+447700900123", xHandle: "alice_x", preferredContact: "whatsapp",
      visibility: { email: true, whatsapp: true, linkedin: true, x: true, github: true, website: true },
    }));
    const me = await alice.get("/api/me");
    const d = await bob.get(`/api/people/${me.json.user.id}`);
    const byCh = Object.fromEntries(d.json.contacts.map((x: any) => [x.channel, x.href]));
    assert.equal(byCh.whatsapp, "https://wa.me/447700900123");
    assert.equal(byCh.x, "https://x.com/alice_x");
    assert.equal(byCh.email, "mailto:alice@test.dev");
    assert.equal(d.json.preferredContact, "whatsapp");
  });

  it("preferred contact must be filled and visible", async () => {
    const r = await alice.put("/api/me/profile", fullProfile({ name: "Alice Doe", preferredContact: "linkedin", linkedinUrl: null }));
    assert.equal(r.status, 400);
  });

  it("non-discoverable profiles disappear from discovery and 404 on direct access", async () => {
    await bob.put("/api/me/profile", fullProfile({ name: "Bob Ray", discoverable: false }));
    const bobId = (await bob.get("/api/me")).json.user.id;
    const list = await alice.get("/api/people");
    assert.ok(!list.json.items.some((p: any) => p.id === bobId));
    assert.equal((await alice.get(`/api/people/${bobId}`)).status, 404);
    assert.equal((await bob.get(`/api/people/${bobId}`)).status, 200, "self can still view");
    await bob.put("/api/me/profile", fullProfile({ name: "Bob Ray", skills: ["Figma"], roles: ["design"], discoverable: true }));
  });

  it("unonboarded users are not listed", async () => {
    const list = await alice.get("/api/people");
    assert.ok(!list.json.items.some((p: any) => p.id === LEGACY.unconfirmed.id || p.id === LEGACY.noprofile.id));
  });

  it("avatars: upload, fetch with cache headers, reject non-images", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
    const up = await alice.req("PUT", "/api/me/avatar", new Uint8Array(png), { "content-type": "image/png" });
    assert.equal(up.status, 200, up.text);
    const url = up.json.profile.avatarUrl as string;
    assert.match(url, /^\/api\/avatars\/.+\?v=1$/);
    const img = await bob.get(url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.match(img.headers.get("cache-control")!, /immutable/);
    const bad = await alice.req("PUT", "/api/me/avatar", new Uint8Array(Buffer.from("<svg onload=alert(1)>")), { "content-type": "image/svg+xml" });
    assert.equal(bad.status, 415);
    const huge = await alice.req("PUT", "/api/me/avatar", new Uint8Array(400 * 1024), { "content-type": "image/png" });
    assert.equal(huge.status, 413);
  });
});

describe("discovery", () => {
  const viewer = new Client(app);
  before(async () => {
    await viewer.signUp("Viewer", "viewer@test.dev");
    await viewer.post("/api/me/onboarding", { name: "Viewer Vee", skills: ["React"], roles: ["frontend"], availability: "looking" });
    await viewer.put("/api/me/profile", fullProfile({ name: "Viewer Vee", skills: ["React"], interests: ["AI/ML", "Web3"], roles: ["frontend"] }));
    for (let i = 0; i < 14; i++) {
      const c = new Client(app);
      await c.signUp(`Person ${i}`, `p${i}@bulk.test`);
      await c.post("/api/me/onboarding", {
        name: `Person ${String(i).padStart(2, "0")}`,
        skills: i % 2 ? ["Python", "PyTorch"] : ["Go"],
        roles: i % 3 ? ["backend"] : ["ai-ml"],
        availability: i % 4 ? "open" : "looking",
        graduationYear: 2026 + (i % 3),
      });
      if (i === 3) await c.put("/api/me/profile", fullProfile({ name: "Person 03", skills: ["Python"], interests: ["Web3"], roles: ["ai-ml"] }));
    }
  });

  it("paginates server-side and excludes the viewer", async () => {
    const p1 = await viewer.get("/api/people?sort=recent");
    assert.equal(p1.json.items.length, 12);
    assert.equal(p1.json.hasMore, true);
    const p2 = await viewer.get("/api/people?sort=recent&page=2");
    assert.ok(p2.json.items.length >= 1);
    assert.equal(p2.json.hasMore, false);
    const ids = [...p1.json.items, ...p2.json.items].map((p: any) => p.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicates across pages");
    const me = await viewer.get("/api/me");
    assert.ok(!ids.includes(me.json.user.id));
  });

  it("filters by skill (all), role (any), availability and graduation year", async () => {
    const py = await viewer.get("/api/people?skills=python,pytorch");
    assert.ok(py.json.items.length > 0 && py.json.items.every((p: any) => p.skills.includes("Python") && p.skills.includes("PyTorch")));
    const roles = await viewer.get("/api/people?roles=ai-ml");
    assert.ok(roles.json.items.every((p: any) => p.roles.includes("ai-ml")));
    const looking = await viewer.get("/api/people?availability=looking");
    assert.ok(looking.json.items.every((p: any) => p.availability === "looking"));
    const yr = await viewer.get("/api/people?graduationYear=2027");
    assert.ok(yr.json.items.length > 0 && yr.json.items.every((p: any) => p.graduationYear === 2027));
    assert.equal((await viewer.get("/api/people?roles=not-a-role")).status, 400);
  });

  it("search matches names and skills; wildcards are escaped", async () => {
    const byName = await viewer.get("/api/people?q=person%2007");
    assert.equal(byName.json.items.length, 1);
    const bySkill = await viewer.get("/api/people?q=pytorch");
    assert.ok(bySkill.json.items.length > 0);
    const wild = await viewer.get("/api/people?q=%25");
    assert.equal(wild.json.total, 0);
  });

  it("best-match ranks shared interests + complementary roles first", async () => {
    const r = await viewer.get("/api/people?sort=match");
    assert.equal(r.json.items[0].name, "Person 03");
    assert.deepEqual(r.json.items[0].match.sharedInterests, ["Web3"]);
    assert.deepEqual(r.json.items[0].match.complementaryRoles, ["ai-ml"]);
  });

  it("empty results are a normal empty page", async () => {
    const r = await viewer.get("/api/people?q=zzzzzz");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    assert.equal(r.json.total, 0);
  });

  it("popular tags come from discoverable profiles only", async () => {
    const r = await viewer.get("/api/people/tags");
    assert.ok(r.json.skills.some((s: any) => s.label === "Python"));
  });
});

describe("teams", () => {
  const owner = new Client(app);
  const joiner = new Client(app);
  const stranger = new Client(app);
  const fresh = new Client(app);
  let teamId = "";
  let joinerId = "";

  before(async () => {
    for (const [c, n] of [[owner, "Owner"], [joiner, "Joiner"], [stranger, "Stranger"]] as const) {
      await c.signUp(n, `${n.toLowerCase()}@teams.test`);
      await c.post("/api/me/onboarding", { name: `${n} Person`, skills: ["React"], roles: ["fullstack"], availability: "looking" });
    }
    await fresh.signUp("Fresh", "fresh@teams.test");
    joinerId = (await joiner.get("/api/me")).json.user.id;
  });

  const team = (over: Record<string, unknown> = {}) => ({
    name: "Compass Crew",
    hackathonName: "HackMUJ 2026",
    description: "Building a tool that helps students find teammates fast.",
    neededSkills: ["figma", "python"],
    neededRoles: ["design"],
    timeline: "48 hours",
    maxMembers: 2,
    contactLink: "https://chat.whatsapp.com/abcdef",
    status: "recruiting",
    ...over,
  });

  it("requires a finished profile and a safe https link", async () => {
    assert.equal((await fresh.post("/api/teams", team())).status, 403);
    assert.equal((await owner.post("/api/teams", team({ contactLink: "javascript:alert(1)" }))).status, 400);
    assert.equal((await owner.post("/api/teams", team({ contactLink: "http://chat.whatsapp.com/x" }))).status, 400);
  });

  it("creates a team with the owner as first member", async () => {
    const r = await owner.post("/api/teams", team());
    assert.equal(r.status, 201, r.text);
    teamId = r.json.id;
    assert.equal(r.json.viewerState, "owner");
    assert.equal(r.json.memberCount, 1);
    assert.deepEqual(r.json.neededSkills, ["Figma", "Python"]);
    assert.equal(r.json.contactLink, "https://chat.whatsapp.com/abcdef");
  });

  it("hides the group link from non-members", async () => {
    const r = await stranger.get(`/api/teams/${teamId}`);
    assert.equal(r.json.contactLink, null);
    assert.equal(r.json.pendingRequests, null);
    assert.ok(!r.text.includes("chat.whatsapp.com"));
  });

  it("only the owner can edit or delete", async () => {
    assert.equal((await stranger.patch(`/api/teams/${teamId}`, team({ name: "Hijacked" }))).status, 403);
    assert.equal((await stranger.del(`/api/teams/${teamId}`)).status, 403);
    const ok = await owner.patch(`/api/teams/${teamId}`, team({ name: "Compass Crew v2" }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.name, "Compass Crew v2");
  });

  it("join request → duplicate blocked → stranger can't approve → owner accepts", async () => {
    const r = await joiner.post(`/api/teams/${teamId}/requests`, { message: "I do design!" });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.viewerState, "pending");
    assert.equal((await joiner.post(`/api/teams/${teamId}/requests`, {})).status, 409);
    const view = await owner.get(`/api/teams/${teamId}`);
    assert.equal(view.json.pendingRequests.length, 1);
    const reqId = view.json.pendingRequests[0].id;
    assert.equal((await stranger.post(`/api/teams/${teamId}/requests/${reqId}`, { decision: "accept" })).status, 403);
    assert.equal((await joiner.post(`/api/teams/${teamId}/requests/${reqId}`, { decision: "accept" })).status, 403);
    const acc = await owner.post(`/api/teams/${teamId}/requests/${reqId}`, { decision: "accept" });
    assert.equal(acc.status, 200, acc.text);
    assert.equal(acc.json.memberCount, 2);
    assert.equal(acc.json.status, "full", "auto-marked full at max members");
    const asMember = await joiner.get(`/api/teams/${teamId}`);
    assert.equal(asMember.json.viewerState, "member");
    assert.equal(asMember.json.contactLink, "https://chat.whatsapp.com/abcdef");
  });

  it("full teams reject new requests; members can see each other's profiles", async () => {
    assert.equal((await stranger.post(`/api/teams/${teamId}/requests`, {})).status, 409);
    const ownerId = (await owner.get("/api/me")).json.user.id;
    assert.equal((await joiner.get(`/api/people/${ownerId}`)).status, 200);
  });

  it("strangers can't remove members; owner can't leave; member can leave", async () => {
    assert.equal((await stranger.del(`/api/teams/${teamId}/members/${joinerId}`)).status, 403);
    assert.equal((await owner.post(`/api/teams/${teamId}/leave`)).status, 409);
    assert.equal((await stranger.post(`/api/teams/${teamId}/leave`)).status, 404);
    assert.equal((await joiner.post(`/api/teams/${teamId}/leave`)).status, 200);
    const after = await owner.get(`/api/teams/${teamId}`);
    assert.equal(after.json.memberCount, 1);
    assert.equal(after.json.status, "recruiting", "reopens after someone leaves a full team");
  });

  it("withdraw and decline flows", async () => {
    await stranger.post(`/api/teams/${teamId}/requests`, {});
    assert.equal((await stranger.del(`/api/teams/${teamId}/requests/mine`)).status, 200);
    await stranger.post(`/api/teams/${teamId}/requests`, { message: "again" });
    const reqId = (await owner.get(`/api/teams/${teamId}`)).json.pendingRequests[0].id;
    const d = await owner.post(`/api/teams/${teamId}/requests/${reqId}`, { decision: "decline" });
    assert.equal(d.json.pendingRequests.length, 0);
    assert.equal((await stranger.get(`/api/teams/${teamId}`)).json.viewerState, "none");
  });

  it("owner can remove a member and cannot shrink below member count", async () => {
    await joiner.post(`/api/teams/${teamId}/requests`, {});
    const reqId = (await owner.get(`/api/teams/${teamId}`)).json.pendingRequests[0].id;
    await owner.post(`/api/teams/${teamId}/requests/${reqId}`, { decision: "accept" });
    assert.equal((await owner.patch(`/api/teams/${teamId}`, team({ maxMembers: 1 }))).status, 400);
    const rm = await owner.del(`/api/teams/${teamId}/members/${joinerId}`);
    assert.equal(rm.status, 200);
    assert.equal(rm.json.memberCount, 1);
  });

  it("lists teams with filters and 'mine'", async () => {
    const all = await stranger.get("/api/teams");
    assert.ok(all.json.items.some((t: any) => t.id === teamId));
    const bySkill = await stranger.get("/api/teams?skills=figma");
    assert.ok(bySkill.json.items.every((t: any) => t.neededSkills.includes("Figma")));
    const mine = await owner.get("/api/teams?mine=1");
    assert.ok(mine.json.items.every((t: any) => t.viewerState === "owner" || t.viewerState === "member"));
    assert.equal((await stranger.get("/api/teams?mine=1")).json.total, 0);
  });

  it("bad ids are 404, not 500", async () => {
    assert.equal((await owner.get("/api/teams/not-a-uuid")).status, 404);
    assert.equal((await owner.get("/api/teams/00000000-0000-4000-8000-000000000000")).status, 404);
    assert.equal((await owner.get("/api/people/not-a-uuid")).status, 404);
  });

  it("owner deletes the team", async () => {
    assert.equal((await owner.del(`/api/teams/${teamId}`)).status, 200);
    assert.equal((await owner.get(`/api/teams/${teamId}`)).status, 404);
  });
});

describe("account lifecycle", () => {
  it("change password requires the current one and works", async () => {
    const c = new Client(app);
    await c.signUp("Changer", "changer@test.dev", "first-pass-1");
    assert.equal((await c.post("/api/auth/change-password", { currentPassword: "nope-nope-1", newPassword: "second-pass-2" })).status, 400);
    assert.equal((await c.post("/api/auth/change-password", { currentPassword: "first-pass-1", newPassword: "second-pass-2" })).status, 200);
    assert.equal((await new Client(app).signIn("changer@test.dev", "second-pass-2")).status, 200);
  });

  it("deleting an account removes profile, avatar, owned teams and memberships", async () => {
    const c = new Client(app);
    await c.signUp("Leaver", "leaver@test.dev", "leaver-pass-1");
    await c.post("/api/me/onboarding", { name: "Leaver Person", skills: ["Go"], roles: ["backend"], availability: "open" });
    const t = await c.post("/api/teams", { name: "Doomed", description: "This team will be deleted with its owner.", neededSkills: [], neededRoles: [], maxMembers: 3, status: "recruiting" });
    assert.equal(t.status, 201);
    const id = (await c.get("/api/me")).json.user.id;
    assert.equal((await c.post("/api/auth/delete-user", { password: "wrong-pass-1" })).status, 400);
    const del = await c.post("/api/auth/delete-user", { password: "leaver-pass-1" });
    assert.equal(del.status, 200, del.text);
    const left = await pool().query(
      "SELECT (SELECT count(*) FROM users WHERE id=$1) u, (SELECT count(*) FROM profiles WHERE user_id=$1) p, (SELECT count(*) FROM teams WHERE owner_id=$1) t, (SELECT count(*) FROM team_members WHERE user_id=$1) m",
      [id],
    );
    assert.deepEqual(Object.values(left.rows[0]).map(Number), [0, 0, 0, 0]);
    assert.equal((await c.get("/api/me")).status, 401);
  });
});

describe("platform", () => {
  it("health reports database status", async () => {
    const r = await new Client(app).get("/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.db.ok, true);
  });
  it("public config exposes only non-secret flags", async () => {
    const r = await new Client(app).get("/api/config");
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ["emailEnabled", "supportUrl"]);
  });
  it("liveness endpoint answers without touching the database", async () => {
    const r = await new Client(app).get("/api/health/live");
    assert.equal(r.status, 200);
    assert.equal(r.json.db, undefined);
  });
  it("sets security headers and no-store on API responses", async () => {
    const r = await new Client(app).get("/api/health");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
  it("rejects oversized and malformed bodies", async () => {
    const c = new Client(app);
    await c.signUp("Big", "big@test.dev");
    const big = await c.req("PUT", "/api/me/profile", { ...fullProfile(), bio: "x".repeat(70 * 1024) });
    assert.equal(big.status, 413);
    const bad = await c.req("PUT", "/api/me/profile", undefined, { "content-type": "application/json" });
    assert.equal(bad.status, 400);
  });
  it("unknown endpoints return JSON 404", async () => {
    const r = await new Client(app).get("/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, "not_found");
  });
  it("CORS only echoes trusted origins", async () => {
    const good = await new Client(app).req("GET", "/api/health", undefined, { origin: "http://localhost:5173" });
    assert.equal(good.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const evil = await new Client(app).req("GET", "/api/health", undefined, { origin: "https://evil.example" });
    assert.equal(evil.headers.get("access-control-allow-origin"), null);
  });
});
