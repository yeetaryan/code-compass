/**
 * Browser checks for profile recovery against a local stack seeded with the legacy fixture (tests/helpers.ts).
 *   BASE_URL=http://localhost:5173 API_LOG=<api log file> SHOTS=./shots node tests/e2e/recovery-flows.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const SHOTS = process.env.SHOTS ?? "./shots";
const API_LOG = process.env.API_LOG;
mkdirSync(SHOTS, { recursive: true });
const results = [];
const errors = [];
const browser = await chromium.launch();
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS  ${name}`); } catch (e) { results.push(`FAIL  ${name}: ${e.message.split("\n")[0]}`); }
};
const watch = (p, l) => {
  p.on("pageerror", (e) => errors.push(`[${l}] ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/status of (401|400|403|404|409|429)/.test(m.text()) && errors.push(`[${l}] ${m.text()}`));
};
async function signIn(page, email, password) {
  await page.goto(BASE + "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(discover|onboarding)/);
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
let page = await ctx.newPage();
watch(page, "desktop");

await step("returning user with a full v1 profile sees Welcome back on Discover", async () => {
  await signIn(page, "six@legacy.test", "abc123");
  await page.waitForURL(/\/discover/);
  await page.getByRole("heading", { name: "Welcome back to Code Compass." }).waitFor();
  await page.getByText(/we restored your previous profile: your year, skills, interests, WhatsApp and X handle/i).waitFor();
  await page.screenshot({ path: `${SHOTS}/r1-welcome-back.png` });
});

await step("Start fresh → onboarding offers to restore again → restore", async () => {
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start fresh" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByText("Changed your mind?").waitFor();
  await page.screenshot({ path: `${SHOTS}/r2-changed-mind.png` });
  await page.getByRole("button", { name: "Restore my previous profile" }).click();
  await page.waitForURL(/\/discover/);
  await page.getByRole("heading", { name: "Welcome back to Code Compass." }).waitFor();
  await page.getByRole("button", { name: "Looks good" }).click();
  await page.getByRole("heading", { name: "Welcome back to Code Compass." }).waitFor({ state: "detached" });
  await page.reload();
  if (await page.getByRole("heading", { name: "Welcome back to Code Compass." }).count()) throw new Error("banner came back after acknowledging");
});
await ctx.clearCookies();

await step("returning user with no v1 profile is told so and goes through onboarding", async () => {
  await signIn(page, "noprofile@legacy.test", "noprofile1");
  await page.waitForURL(/\/onboarding/);
  await page.getByText(/didn't have any saved profile details/).waitFor();
  await page.screenshot({ path: `${SHOTS}/r3-empty.png` });
});
await ctx.clearCookies();

await step("new user recovers an old profile with an emailed code (review → restore)", async () => {
  await page.goto(BASE + "/sign-up");
  await page.getByLabel("Full name").fill("Fresh Account");
  await page.getByLabel("Email").fill(`fresh-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("fresh-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByRole("link", { name: /Already used Code Compass\?/ }).click();
  await page.waitForURL(/\/recover/);
  await page.screenshot({ path: `${SHOTS}/r4-recover-email.png` });
  await page.getByLabel("Email you used on Code Compass before").fill("old@legacy.test");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("6-digit code").waitFor();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByText(/isn't right or has expired/).waitFor();
  await page.waitForTimeout(500);
  const log = readFileSync(API_LOG, "utf8");
  const code = [...log.matchAll(/to=old@legacy\.test subject="(\d{6}) is your Code Compass recovery code"/g)].at(-1)?.[1];
  if (!code) throw new Error("no code in API log");
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByRole("heading", { name: "We found your previous profile" }).waitFor();
  await page.getByText("Rust, Go").waitFor();
  await page.screenshot({ path: `${SHOTS}/r5-review.png` });
  await page.getByRole("button", { name: "Recover my profile" }).click();
  await page.waitForURL(/\/profile/);
  await page.getByText(/We moved your previous profile into this account/).waitFor();
  await page.screenshot({ path: `${SHOTS}/r6-moved.png` });
});
await ctx.close();

const m = await browser.newContext({ ...devices["iPhone 13"] });
page = await m.newPage();
watch(page, "mobile");
await step("mobile: recover page and welcome banner fit without horizontal scroll", async () => {
  await signIn(page, "hidden@legacy.test", "longerpass1");
  await page.waitForURL(/\/discover/);
  await page.getByRole("heading", { name: "Welcome back to Code Compass." }).waitFor();
  for (const path of ["/discover", "/recover", "/onboarding"]) {
    await page.goto(BASE + path);
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (o > 1) throw new Error(`${path} overflows by ${o}px`);
  }
  await page.goto(BASE + "/discover");
  await page.getByRole("heading", { name: "Welcome back to Code Compass." }).waitFor();
  await page.screenshot({ path: `${SHOTS}/r7-mobile-banner.png` });
});
await browser.close();
console.log(results.join("\n"));
if (errors.length) console.log("Browser errors:\n" + errors.join("\n"));
const bad = results.filter((r) => r.startsWith("FAIL")).length + errors.length;
console.log(bad ? `${bad} problem(s)` : `All ${results.length} recovery flows passed with no browser errors`);
process.exit(bad ? 1 : 0);
