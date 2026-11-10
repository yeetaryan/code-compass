/**
 * Browser flows against a running app (vite preview + API) seeded with scripts/seed-demo.ts.
 *   BASE_URL=http://localhost:5173 SHOTS=./shots node tests/e2e/flows.mjs
 * Fails on any uncaught page error or console error.
 */
import { createRequire } from "node:module";
// Playwright is not a project dependency (CI/dev machines install it globally or via npx playwright).
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const SHOTS = process.env.SHOTS ?? "./shots";
mkdirSync(SHOTS, { recursive: true });
const errors = [];
const results = [];
const stamp = Date.now();
const email = `e2e-${stamp}@example.com`;

const browser = await chromium.launch();

function watch(page, label) {
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // expected: 401 from /api/me when signed out, 4xx from deliberate negative tests
    if (/status of (401|400|404|409)/.test(t)) return;
    errors.push(`[${label}] console: ${t}`);
  });
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`PASS  ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    results.push(`FAIL  ${name}: ${e.message.split("\n")[0]}`);
  }
}

async function shot(page, name, full = true) {
  if (full) {
    // scroll through once so in-view reveal animations run before a full-page capture
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
}

/* ── Desktop ── */
const desk = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
const page = await desk.newPage();
watch(page, "desktop");

await step("landing renders hero, sections and CTAs", async () => {
  await page.goto(BASE + "/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const h1 = await page.getByRole("heading", { level: 1 }).innerText();
  if (!/Find your people/i.test(h1)) throw new Error("hero headline missing: " + h1);
  for (const id of ["how", "product", "privacy", "faq"]) if (!(await page.locator(`#${id}`).count())) throw new Error(`missing #${id}`);
  if (await page.getByText(/127|92\.1%/).count()) throw new Error("fabricated stats present");
  await page.waitForTimeout(900);
  await shot(page, "01-landing-desktop");
});

await step("protected routes redirect to sign-in", async () => {
  await page.goto(BASE + "/discover");
  await page.waitForURL(/\/sign-in\?next=%2Fdiscover/);
});

await step("sign-up validates input", async () => {
  await page.goto(BASE + "/sign-up");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Enter your name").waitFor();
  await page.getByText("Use at least 8 characters").first().waitFor();
});

await step("sign up → onboarding (2 steps) → discover", async () => {
  await page.getByLabel("Full name").fill("Priya Sharma");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await shot(page, "02-onboarding-step1", false);
  await page.getByLabel("College or university").fill("Manipal University Jaipur");
  await page.getByLabel("Graduation year").selectOption("2027");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish and explore" }).click();
  await page.getByText("Add at least one skill").waitFor();
  const skills = page.getByRole("combobox");
  await skills.fill("React");
  await skills.press("Enter");
  await skills.fill("Node.js");
  await skills.press("Enter");
  await page.getByRole("button", { name: "Frontend", exact: true }).click();
  await shot(page, "03-onboarding-step2", false);
  await page.getByRole("button", { name: "Finish and explore" }).click();
  await page.waitForURL(/\/discover/);
  await page.locator("h3 a").first().waitFor();
});

await step("discover: best-match ranking explains matches", async () => {
  await page.waitForTimeout(500);
  const count = await page.locator("h3 a").count();
  if (count < 5) throw new Error(`expected seeded people, got ${count}`);
  if (!(await page.getByText(/Covers|Shares/).first().isVisible())) throw new Error("no match explanation");
  await shot(page, "04-discover-desktop");
});

await step("discover: search + role filter + clear", async () => {
  await page.getByLabel("Search people").fill("pytorch");
  await page.waitForURL(/q=pytorch/);
  await page.getByRole("heading", { name: "Kabir Rao" }).waitFor();
  await page.getByLabel("Search people").fill("");
  await page.waitForURL((u) => !u.search.includes("q="));
  await page.getByRole("group", { name: "Filter by role" }).getByRole("button", { name: "Design (UI/UX)" }).click();
  await page.waitForURL(/roles=design/);
  await page.waitForTimeout(400);
  const names = await page.locator("h3 a").allInnerTexts();
  if (!names.includes("Sara Iqbal") || names.includes("Kabir Rao")) throw new Error("role filter wrong: " + names.join(","));
  await page.getByLabel("Search people").fill("zzzzzz");
  await page.getByText("No one matches those filters").waitFor();
  await shot(page, "05-discover-empty", false);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.waitForURL((u) => !u.search.includes("roles"));
});

await step("person detail shows visible contacts with safe links", async () => {
  await page.goto(BASE + "/discover?q=sara");
  await page.getByRole("link", { name: "Sara Iqbal" }).click();
  await page.waitForURL(/\/people\//);
  await page.getByRole("heading", { name: "Sara Iqbal", level: 1 }).waitFor();
  const li = page.getByRole("link", { name: /LinkedIn/ }).first();
  const rel = await li.getAttribute("rel");
  const target = await li.getAttribute("target");
  const href = await li.getAttribute("href");
  if (!rel?.includes("noopener") || target !== "_blank" || !href?.startsWith("https://www.linkedin.com/in/")) throw new Error(`bad link ${href} ${rel} ${target}`);
  await shot(page, "06-person-detail");
});

await step("edit profile: LinkedIn validation, X kept separately, privacy toggle", async () => {
  await page.goto(BASE + "/profile");
  await page.getByLabel("LinkedIn URL").fill("https://example.com/in/priya");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/linkedin\.com\/in/i).first().waitFor();
  await page.getByLabel("LinkedIn URL").fill("linkedin.com/in/priya-sharma-e2e");
  await page.getByLabel("X handle").fill("@priya_e2e");
  await page.getByLabel("Short bio").fill("Frontend dev who loves design systems. Looking for backend and ML folks for HackMUJ.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Profile saved").waitFor();
  await page.reload();
  const v = await page.getByLabel("LinkedIn URL").inputValue();
  if (v !== "https://www.linkedin.com/in/priya-sharma-e2e") throw new Error("LinkedIn not normalised: " + v);
  if ((await page.getByLabel("X handle").inputValue()) !== "priya_e2e") throw new Error("X handle not normalised");
  await shot(page, "07-edit-profile");
});

await step("avatar upload is resized client-side and shown", async () => {
  await page.goto(BASE + "/profile");
  await page.locator("#avatar-file").setInputFiles(new URL("./fixtures/avatar.png", import.meta.url).pathname);
  await page.getByText("Photo updated").waitFor();
  const img = page.locator('main img[alt="Priya Sharma\'s photo"]').first();
  await img.waitFor();
  const ok = await img.evaluate((el) => el.complete && el.naturalWidth > 0 && el.naturalWidth <= 512 && el.naturalWidth === el.naturalHeight);
  if (!ok) throw new Error("avatar not rendered as a ≤512px square");
});

await step("teams: list, request to join", async () => {
  await page.goto(BASE + "/teams");
  await page.getByRole("link", { name: "Campus Commute" }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
  if (await page.getByText("chat.whatsapp.com").count()) throw new Error("group link visible to non-member");
  await page.getByRole("button", { name: "Ask to join" }).click();
  await page.getByLabel("Message").fill("I can take the mobile UI — I've shipped two Flutter apps.");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.getByText("Request sent").first().waitFor();
  await shot(page, "08-team-requested");
});

const teamUrl = page.url();

await step("owner accepts request in another session; member sees group chat", async () => {
  const owner = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  const op = await owner.newPage();
  watch(op, "owner");
  await op.goto(BASE + "/sign-in");
  await op.getByLabel("Email").fill("nia@demo.codecompass.dev");
  await op.getByLabel("Password", { exact: true }).fill("demo-password");
  await op.getByRole("button", { name: "Sign in" }).click();
  await op.waitForURL(/\/discover/);
  await op.goto(teamUrl);
  await op.getByText("Priya Sharma").first().waitFor();
  await shot(op, "09-team-owner-review");
  await op.locator("li", { hasText: "Priya Sharma" }).first().getByRole("button", { name: "Accept" }).click();
  await op.getByText("Priya Sharma joined the team").waitFor();
  await owner.close();
  await page.reload();
  await page.getByText("You're on this team").waitFor();
  await page.getByRole("link", { name: /Open group chat/ }).waitFor();
});

await step("create a team with validation", async () => {
  await page.goto(BASE + "/teams/new");
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText("Give your team a name").waitFor();
  await page.getByLabel("Team name").fill("Compass Crew");
  await page.getByLabel("Hackathon or event").fill("HackMUJ 2026");
  await page.getByLabel("Description").fill("A browser extension that summarises lecture slides into flashcards.");
  await page.getByRole("button", { name: "AI / ML", exact: true }).click();
  await page.getByLabel("Group link").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText(/https/).first().waitFor();
  await page.getByLabel("Group link").fill("https://chat.whatsapp.com/e2e-test");
  await page.getByRole("button", { name: "Create team" }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
  await page.getByRole("heading", { name: "Compass Crew" }).waitFor();
  await shot(page, "10-team-owner");
});

await step("sign out returns to landing; app routes protected again", async () => {
  await page.goto(BASE + "/discover");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(BASE + "/");
  await page.goto(BASE + "/teams");
  await page.waitForURL(/sign-in/);
});

await step("sign in with wrong password shows a friendly error", async () => {
  await page.goto(BASE + "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("That email and password don't match").waitFor();
  await shot(page, "11-sign-in-error", false);
});

await step("forgot password shows a neutral confirmation", async () => {
  await page.goto(BASE + "/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText(/If an account exists/).waitFor();
});

await step("404 page", async () => {
  await page.goto(BASE + "/definitely-not-here");
  await page.getByText("wandered off the map").waitFor();
});
await desk.close();

/* ── Mobile ── */
const mob = await browser.newContext({ ...devices["iPhone 13"] });
const mp = await mob.newPage();
watch(mp, "mobile");

await step("mobile: landing has no horizontal overflow", async () => {
  await mp.goto(BASE + "/");
  await mp.waitForTimeout(900);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px`);
  await shot(mp, "20-landing-mobile");
});

await step("mobile: sign in, discover, menu, team page", async () => {
  await mp.goto(BASE + "/sign-in");
  await mp.getByLabel("Email").fill(email);
  await mp.getByLabel("Password", { exact: true }).fill("e2e-password-1");
  await mp.getByRole("button", { name: "Sign in" }).click();
  await mp.waitForURL(/\/discover/);
  await mp.locator("h3 a").first().waitFor();
  for (const path of ["/discover", "/teams", "/profile"]) {
    await mp.goto(BASE + path);
    await mp.waitForTimeout(600);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`${path}: horizontal overflow ${overflow}px`);
  }
  await mp.goto(BASE + "/discover");
  await mp.locator("h3 a").first().waitFor();
  await shot(mp, "21-discover-mobile", false);
  await mp.getByRole("button", { name: "Open menu" }).click();
  await mp.getByRole("dialog").getByRole("link", { name: "Teams" }).waitFor();
  await shot(mp, "22-menu-mobile", false);
  await mp.keyboard.press("Escape");
  await mp.goto(teamUrl);
  await mp.getByText("You're on this team").waitFor();
  await shot(mp, "23-team-mobile");
});

await step("mobile: touch targets ≥ 32px on discover controls", async () => {
  await mp.goto(BASE + "/discover");
  const small = await mp.evaluate(() =>
    [...document.querySelectorAll("main button, main a, main input")]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ t: el.textContent?.trim().slice(0, 20) || el.getAttribute("aria-label") || el.tagName, h: el.getBoundingClientRect().height }))
      .filter((x) => x.h < 32 && x.t !== "A"),
  );
  // inline text links inside cards are exempt; report the rest
  const offenders = small.filter((s) => !/^[A-Z][a-z]+ [A-Z]/.test(s.t));
  if (offenders.length) throw new Error("small targets: " + JSON.stringify(offenders.slice(0, 5)));
});
await mob.close();
await browser.close();

console.log(results.join("\n"));
if (errors.length) console.log("\nBrowser errors:\n" + errors.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length + errors.length;
console.log(failed ? `\n${failed} problem(s)` : `\nAll ${results.length} flows passed with no browser errors`);
process.exit(failed ? 1 : 0);
