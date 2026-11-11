/**
 * Historical (v1) profile recovery: automatic restore, Welcome-back summary, Start fresh / restore again,
 * and verified manual recovery into a different account.
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
const FIXTURE = "./migration-output/test-fixture-recovery.backup";

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

const signedIn = async (u: { email: string; password: string }) => {
  const c = new Client(app);
  const r = await c.signIn(u.email, u.password);
  assert.equal(r.status, 200, r.text);
  return c;
};
const mailTo = async (email: string, since: number) => {
  for (let i = 0; i < 60; i++) {
    const m = testOutbox.slice(since).find((x) => x.to === email);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 25));
  }
  return undefined;
};
const codeFrom = (text: string) => text.match(/\b(\d{6})\b/)![1];
const profileRows = async (id: string) => Number((await pool().query("SELECT count(*) n FROM profiles WHERE user_id = $1", [id])).rows[0].n);

describe("automatic recovery (original account)", () => {
  it("default import keeps v1 profiles out of Discover until their owner signs in and confirms", async () => {
    const viewer = new Client(app);
    await viewer.signUp("Viewer", "viewer@test.dev");
    await viewer.post("/api/me/onboarding", { name: "Viewer", skills: ["SQL"], roles: ["backend"], availability: "open", college: null, graduationYear: null });
    const d = (await viewer.get("/api/people?q=Six")).json;
    assert.ok(!d.items.some((p: { id: string }) => p.id === LEGACY.six.id), "not listed before the owner returns");
    assert.equal((await viewer.get(`/api/people/${LEGACY.six.id}`)).status, 404, "profile URL hidden too");
    const s = await pool().query("SELECT status FROM legacy_profiles WHERE user_id = $1", [LEGACY.six.id]);
    assert.equal(s.rows[0].status, "pending");
  });

  it("existing user with a complete v1 profile: restored at sign-in, confirmed in onboarding, no duplicate profile", async () => {
    const c = await signedIn(LEGACY.six);
    let me = (await c.get("/api/me")).json;
    assert.equal(me.user.id, LEGACY.six.id, "preserved user id");
    assert.equal(me.recovery.state, "restored");
    assert.equal(me.recovery.via, "auto");
    assert.equal(me.recovery.acknowledged, false);
    for (const f of ["yearOfStudy", "skills", "interests", "whatsapp", "xHandle"]) assert.ok(me.recovery.fields.includes(f), f);
    assert.deepEqual(me.profile.skills, ["JavaScript", "React", "Node.js"]);
    assert.equal(me.profile.onboarded, false, "not published until the owner confirms");
    assert.equal(me.profile.visibility.whatsapp, true, "v1 choice shown to the owner for confirmation");
    assert.equal((await c.get("/api/me")).json.recovery.via, "auto", "restored once, not again");

    const r = await c.post("/api/me/onboarding", {
      name: "Six Legacy", skills: me.profile.skills, roles: ["frontend"], availability: "open", college: null, graduationYear: null,
      whatsappVisible: false, xVisible: true,
    });
    assert.equal(r.status, 200, r.text);
    me = r.json;
    assert.equal(me.profile.onboarded, true);
    assert.equal(me.profile.visibility.whatsapp, false, "owner hid WhatsApp while confirming");
    assert.deepEqual(me.profile.interests, ["Web Development", "AI/ML"], "interests kept through onboarding");
    assert.equal(await profileRows(LEGACY.six.id), 1);
    assert.equal((await c.post("/api/recovery/acknowledge")).status, 200);
    assert.equal((await c.get("/api/me")).json.recovery.acknowledged, true);
  });

  it("Start fresh clears restored values; restoring again works once; nothing is duplicated", async () => {
    const c = await signedIn(LEGACY.six);
    assert.equal((await c.post("/api/recovery/start-fresh")).status, 200);
    let me = (await c.get("/api/me")).json;
    assert.equal(me.recovery.state, "dismissed");
    assert.deepEqual(me.profile.skills, []);
    assert.equal(me.profile.whatsapp, null);
    assert.deepEqual(me.profile.roles, ["frontend"], "what the user added in v2 stays");
    assert.equal(me.profile.onboarded, true, "still discoverable through the role picked in v2");
    assert.equal((await c.post("/api/recovery/start-fresh")).status, 409, "can't undo twice");

    const again = await c.post("/api/recovery/reapply");
    assert.equal(again.status, 200, again.text);
    me = (await c.get("/api/me")).json;
    assert.equal(me.recovery.state, "restored");
    assert.equal(me.recovery.via, "reapply");
    assert.deepEqual(me.profile.skills, ["JavaScript", "React", "Node.js"]);
    assert.equal((await c.post("/api/recovery/reapply")).status, 409, "duplicate restore refused");
    assert.equal(await profileRows(LEGACY.six.id), 1);
  });

  it("never overwrites information the user entered in v2", async () => {
    const c = await signedIn(LEGACY.hidden);
    assert.equal((await c.get("/api/me")).json.recovery.via, "auto");
    assert.equal((await c.post("/api/recovery/start-fresh")).status, 200);
    const edit = await c.put("/api/me/profile", fullProfile({ name: "Hidden Contact", skills: ["Go"], interests: [], roles: ["backend"] }));
    assert.equal(edit.status, 200, edit.text);
    const r = await c.post("/api/recovery/reapply");
    assert.equal(r.status, 200);
    assert.ok(!r.json.restoredFields.includes("skills"), "skills were already filled in v2");
    const me = (await c.get("/api/me")).json;
    assert.deepEqual(me.profile.skills, ["Go"], "v2 value kept");
    assert.deepEqual(me.profile.interests, ["AI/ML"], "empty field filled from v1");
    assert.equal(me.profile.whatsapp, "+919876543210");
    assert.equal(me.profile.visibility.whatsapp, false, "original hidden setting travels with the value");
  });

  it("existing user with no v1 profile: account kept, clearly marked empty, goes to onboarding", async () => {
    const c = await signedIn(LEGACY.noprofile);
    const me = (await c.get("/api/me")).json;
    assert.equal(me.user.id, LEGACY.noprofile.id);
    assert.equal(me.recovery.state, "empty");
    assert.equal(me.profile.onboarded, false);
    assert.equal((await c.post("/api/recovery/reapply")).status, 409);
  });

  it("user with an unverified email can still sign in with the original password", async () => {
    const c = await signedIn(LEGACY.unconfirmed);
    const me = (await c.get("/api/me")).json;
    assert.equal(me.user.emailVerified, false);
    assert.equal(me.recovery.state, "empty", "v1 profile had only a name");
  });

  it("new user: nothing to recover", async () => {
    const c = new Client(app);
    await c.signUp("Brand New", "brand-new@test.dev");
    assert.deepEqual((await c.get("/api/me")).json.recovery, { state: "none" });
  });

  it("pending snapshot restores automatically at first sign-in, without publishing", async () => {
    // reset to the state a fresh default import leaves behind
    await pool().query("UPDATE legacy_profiles SET status = 'pending', restored_to = NULL, restored_fields = '{}' WHERE user_id = $1", [LEGACY.old.id]);
    await pool().query("UPDATE profiles SET skills = '{}', skills_key = '{}', interests = '{}', interests_key = '{}', whatsapp = NULL, x_handle = NULL, year_of_study = NULL, onboarded_at = NULL WHERE user_id = $1", [LEGACY.old.id]);
    const c = await signedIn(LEGACY.old);
    const me = (await c.get("/api/me")).json;
    assert.equal(me.recovery.state, "restored");
    assert.equal(me.recovery.via, "auto");
    assert.deepEqual(me.profile.skills, ["Rust", "Go"]);
    assert.equal(me.profile.visibility.x, false, "X was hidden in v1 and stays hidden");
    assert.equal(me.profile.onboarded, false);
    const events = await pool().query("SELECT event FROM profile_recovery_events WHERE user_id = $1", [LEGACY.old.id]);
    assert.ok(events.rows.some((e) => e.event === "auto_restored"));
  });
});

describe("manual recovery into a different account", () => {
  const newbie = new Client(app);
  const intruder = new Client(app);
  let genericAnswer = "";
  const generic = async (c: Client, email: string) => {
    const r = await c.post("/api/recovery/request", { email });
    return `${r.status} ${r.text}`;
  };

  before(async () => {
    await newbie.signUp("New Me", "new-me@test.dev");
    await intruder.signUp("Intruder", "intruder@test.dev");
  });

  it("requires a signed-in user", async () => {
    assert.equal((await new Client(app).post("/api/recovery/request", { email: LEGACY.old.email })).status, 401);
    assert.equal((await new Client(app).post("/api/recovery/verify", { code: "123456" })).status, 401);
  });

  it("answers identically for v1 emails, other emails and unknown emails (no enumeration)", async () => {
    const before = testOutbox.length;
    const a = await generic(intruder, "brand-new@test.dev"); // existing v2 account, not v1
    const b = await generic(intruder, "nobody@nowhere.test"); // unknown
    const c = await generic(intruder, LEGACY.noprofile.email); // v1 account without a profile
    assert.equal(a, b);
    assert.equal(b, c);
    genericAnswer = a;
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(testOutbox.length, before, "no email for anything that can't be recovered");
  });

  it("emails a code to the OLD address only, and the response is the same generic one", async () => {
    const since = testOutbox.length;
    const r = await generic(newbie, LEGACY.old.email);
    assert.equal(r, genericAnswer);
    const mail = await mailTo(LEGACY.old.email, since);
    assert.ok(mail, "code sent to the v1 address");
    assert.ok(!testOutbox.slice(since).some((m) => m.to === "new-me@test.dev"), "never sent to the requester");
  });

  it("wrong codes are rejected without revealing anything; another account can't use the code or claim", async () => {
    const wrong = await newbie.post("/api/recovery/verify", { code: "000000" });
    assert.equal(wrong.status, 400);
    assert.ok(!wrong.text.includes("Rust") && !wrong.text.includes("Old Timer"));
    const mail = testOutbox.filter((m) => m.to === LEGACY.old.email).at(-1)!;
    const stolen = await intruder.post("/api/recovery/verify", { code: codeFrom(mail.text) });
    assert.equal(stolen.status, 400, "codes are bound to the account that asked");
    assert.equal((await intruder.post("/api/recovery/claim", { decision: "restore" })).status, 403);
    assert.equal((await newbie.post("/api/recovery/claim", { decision: "restore" })).status, 403, "claim needs a verified code");
  });

  it("verified code shows a review, then restore moves the profile without duplicating it", async () => {
    const mail = testOutbox.filter((m) => m.to === LEGACY.old.email).at(-1)!;
    const v = await newbie.post("/api/recovery/verify", { code: codeFrom(mail.text) });
    assert.equal(v.status, 200, v.text);
    const byField = Object.fromEntries(v.json.fields.map((f: any) => [f.field, f.value]));
    assert.equal(byField.skills, "Rust, Go");
    assert.match(byField.whatsapp, /^•••• 0999/, "number masked in the review");
    assert.ok(!("name" in byField), "the new account's own name is kept");

    const c = await newbie.post("/api/recovery/claim", { decision: "restore" });
    assert.equal(c.status, 200, c.text);
    const me = (await newbie.get("/api/me")).json;
    assert.equal(me.recovery.state, "restored");
    assert.equal(me.recovery.via, "manual");
    assert.deepEqual(me.profile.skills, ["Rust", "Go"]);
    assert.equal(me.profile.name, "New Me");
    assert.equal(me.profile.whatsapp, "+447700900999", "number restored for the owner");
    assert.equal(me.profile.visibility.whatsapp, false, "v1 had it visible, but a manual recovery never publishes contacts unconfirmed");
    assert.equal(me.profile.visibility.x, false);
    assert.equal(me.profile.onboarded, true, "reviewed skills make the profile discoverable");
    const seen = await intruder.get(`/api/people/${me.user.id}`);
    assert.equal(seen.status, 200, seen.text);
    assert.ok(!seen.text.includes("447700900999") && !seen.text.includes("oldx"), "other members can't see the restored contacts");
    assert.ok(!seen.json.contacts.some((c: { channel: string }) => c.channel === "whatsapp" || c.channel === "x"));

    // the old account is preserved but no longer listed, so the person isn't in Discover twice
    const old = await pool().query("SELECT discoverable FROM profiles WHERE user_id = $1", [LEGACY.old.id]);
    assert.equal(old.rows[0].discoverable, false);
    const users = await pool().query("SELECT count(*) n FROM users WHERE id = $1", [LEGACY.old.id]);
    assert.equal(Number(users.rows[0].n), 1);
  });

  it("duplicate recovery attempts are refused", async () => {
    assert.equal((await newbie.post("/api/recovery/claim", { decision: "restore" })).status, 403, "code already used");
    const since = testOutbox.length;
    await generic(intruder, LEGACY.old.email);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(!testOutbox.slice(since).some((m) => m.to === LEGACY.old.email), "already-claimed profile can't be requested again");
    const oldOwner = await signedIn(LEGACY.old);
    assert.equal((await oldOwner.get("/api/me")).json.recovery.state, "none", "old account no longer offers it");
  });

  it("locks the code after 5 wrong attempts", async () => {
    const since = testOutbox.length;
    await generic(intruder, LEGACY.six.email);
    const mail = await mailTo(LEGACY.six.email, since);
    assert.ok(mail);
    for (let i = 0; i < 5; i++) assert.equal((await intruder.post("/api/recovery/verify", { code: "999999" })).status, 400);
    assert.equal((await intruder.post("/api/recovery/verify", { code: "999999" })).status, 429);
    assert.equal((await intruder.post("/api/recovery/verify", { code: codeFrom(mail!.text) })).status, 400, "even the right code is dead now");
    const six = await pool().query("SELECT status FROM legacy_profiles WHERE user_id = $1", [LEGACY.six.id]);
    assert.equal(six.rows[0].status, "restored", "untouched");
  });

  it("choosing Start fresh after verifying restores nothing and uses up the code", async () => {
    const fresh = new Client(app);
    await fresh.signUp("Fresh Start", "fresh-start@test.dev");
    const since = testOutbox.length;
    await fresh.post("/api/recovery/request", { email: LEGACY.hidden.email });
    const mail = await mailTo(LEGACY.hidden.email, since);
    assert.equal((await fresh.post("/api/recovery/verify", { code: codeFrom(mail!.text) })).status, 200);
    const r = await fresh.post("/api/recovery/claim", { decision: "start_fresh" });
    assert.deepEqual(r.json.restoredFields, []);
    const me = (await fresh.get("/api/me")).json;
    assert.equal(me.recovery.state, "none");
    assert.deepEqual(me.profile.skills, []);
    assert.equal((await fresh.post("/api/recovery/claim", { decision: "restore" })).status, 403);
  });

  it("can't target your own email", async () => {
    const own = await signedIn(LEGACY.six);
    const since = testOutbox.length;
    await own.post("/api/recovery/request", { email: LEGACY.six.email });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(testOutbox.length, since);
  });

  it("logs events without codes, tokens or passwords; API never exposes snapshots or hashes", async () => {
    const rows = await pool().query("SELECT event, detail::text d FROM profile_recovery_events");
    assert.ok(rows.rows.length > 5);
    for (const r of rows.rows) assert.doesNotMatch(r.d ?? "", /\b\d{6}\b|\$2[aby]\$|password|token/i);
    const me = await newbie.get("/api/me");
    assert.doesNotMatch(me.text, /\$2[aby]\$|code_hash|"raw"|source_email|legacy/);
  });
});
