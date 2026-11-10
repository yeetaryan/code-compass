import { Hono } from "hono";
import { z } from "zod";
import { emailConfigured, env } from "../env.js";
import { AppError, body, currentUser, rateLimit, requireAuth, type AppEnv } from "../lib/http.js";
import { acknowledge, claim, reapply, requestCode, startFresh, verifyCode } from "../lib/recovery.js";

/** /api/recovery — all routes need a signed-in user; ownership of the OLD account is proven by an emailed code. */
export const recovery = new Hono<AppEnv>();
recovery.use("*", requireAuth);

const requestSchema = z.object({ email: z.string().trim().email("Enter the email address you used before").max(254) }).strict();
const verifySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict();
const claimSchema = z.object({ decision: z.enum(["restore", "start_fresh"]) }).strict();

const GENERIC = {
  ok: true,
  message: "If that email address had a Code Compass profile, we've sent a 6-digit code to it. It expires in 15 minutes.",
};

recovery.post("/request", rateLimit("recovery-request", { window: 3600, max: 5 }), async (c) => {
  const e = env();
  if (!emailConfigured(e) && e.NODE_ENV === "production") {
    throw new AppError(503, "email_unavailable", "Profile recovery by email isn't available yet.");
  }
  const user = currentUser(c);
  const { email } = await body(c, requestSchema);
  await requestCode(user.id, user.email, email);
  return c.json(GENERIC);
});

recovery.post("/verify", rateLimit("recovery-verify", { window: 900, max: 10 }), async (c) => {
  const { code } = await body(c, verifySchema);
  return c.json(await verifyCode(currentUser(c).id, code));
});

recovery.post("/claim", rateLimit("recovery-claim", { window: 900, max: 10 }), async (c) => {
  const { decision } = await body(c, claimSchema);
  const fields = await claim(currentUser(c).id, decision);
  return c.json({ ok: true, restoredFields: fields });
});

/* Own-account actions on the "Welcome back" summary */
recovery.post("/acknowledge", async (c) => {
  await acknowledge(currentUser(c).id);
  return c.json({ ok: true });
});
recovery.post("/start-fresh", rateLimit("recovery-undo", { window: 900, max: 10 }), async (c) => {
  await startFresh(currentUser(c).id);
  return c.json({ ok: true });
});
recovery.post("/reapply", rateLimit("recovery-undo", { window: 900, max: 10 }), async (c) => {
  const fields = await reapply(currentUser(c).id);
  return c.json({ ok: true, restoredFields: fields });
});
