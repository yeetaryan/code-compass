/**
 * Historical (v1) profile recovery.
 *
 *  - Automatic: a v1 account's snapshot is keyed by its preserved user id. If it is still "pending" when the
 *    owner signs in, its details are filled into the (empty) live profile right away, but the profile stays out
 *    of Discover until the owner checks them and finishes onboarding. They can undo ("Start fresh") or
 *    restore again later.
 *  - Manual: a signed-in user can move a v1 profile into their (different) account only after entering a
 *    6-digit code sent to the v1 email address. Requests always get the same answer, so nobody can learn
 *    which emails had accounts.
 *
 * Every state change runs in a transaction that locks the snapshot row, so double clicks and parallel
 * requests can't restore twice. Events are logged without codes, tokens or passwords.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { RecoveredField, RecoveryPreview, RecoveryState } from "../../shared/api-types.js";
import { db } from "../db/client.js";
import { legacyProfiles, profileRecoveryCodes, profileRecoveryEvents, profiles, type SnapshotData } from "../db/schema.js";
import { env } from "../env.js";
import { AppError } from "./http.js";
import { actionEmail, sendMail } from "./mailer.js";
import { meaningfulFields, mergeSnapshot, undoSnapshot, type LiveProfile } from "./recovery-merge.js";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type Snapshot = typeof legacyProfiles.$inferSelect;

export const CODE_TTL_MS = 15 * 60 * 1000;
export const VERIFIED_TTL_MS = 30 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

const FIELD_LABELS: Record<RecoveredField, string> = {
  name: "Name",
  yearOfStudy: "Year",
  skills: "Skills",
  interests: "Interests",
  whatsapp: "WhatsApp",
  xHandle: "X (Twitter)",
};

async function logEvent(tx: Tx | ReturnType<typeof db>, e: { userId: string | null; legacyUserId?: string | null; event: string; detail?: Record<string, unknown> }) {
  await tx.insert(profileRecoveryEvents).values({ userId: e.userId, legacyUserId: e.legacyUserId ?? null, event: e.event, detail: e.detail ?? null });
}

const livePick = (p: typeof profiles.$inferSelect): LiveProfile => ({
  name: p.name,
  yearOfStudy: p.yearOfStudy,
  skills: p.skills,
  skillsKey: p.skillsKey,
  interests: p.interests,
  interestsKey: p.interestsKey,
  roles: p.roles,
  whatsapp: p.whatsapp,
  whatsappVisible: p.whatsappVisible,
  xHandle: p.xHandle,
  xVisible: p.xVisible,
  onboardedAt: p.onboardedAt,
});

async function lockSnapshot(tx: Tx, userId: string) {
  const [s] = await tx.select().from(legacyProfiles).where(eq(legacyProfiles.userId, userId)).for("update");
  return s;
}

async function lockProfile(tx: Tx, userId: string) {
  const [p] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).for("update");
  if (!p) throw new AppError(409, "no_profile", "Your profile isn't ready yet. Reload and try again.");
  return p;
}

/** Applies a snapshot to `targetId`'s live profile. Caller holds the snapshot lock. */
async function applyLocked(tx: Tx, snap: Snapshot, targetId: string, via: "auto" | "manual" | "reapply") {
  if (!snap.data || !meaningfulFields(snap.data).length) throw new AppError(409, "nothing_to_restore", "There's no saved profile information to restore.");
  const live = await lockProfile(tx, targetId);
  const now = new Date();
  const { patch, fields } = mergeSnapshot(livePick(live), snap.data, now);
  // Automatic and repeat restores never publish on their own: the owner confirms the restored details in
  // onboarding first (old data may be out of date). A manual recovery is itself an explicit review, so it may.
  if (via !== "manual") delete patch.onboardedAt;
  if (Object.keys(patch).length) await tx.update(profiles).set({ ...patch, updatedAt: now }).where(eq(profiles.userId, targetId));
  const claimedElsewhere = targetId !== snap.userId;
  if (claimedElsewhere) {
    // Don't list the same person twice: hide the old account's copy from Discover (the account itself is kept).
    await tx.update(profiles).set({ discoverable: false, updatedAt: now }).where(eq(profiles.userId, snap.userId));
  }
  await tx
    .update(legacyProfiles)
    .set({ status: claimedElsewhere ? "claimed" : "restored", restoredTo: targetId, restoredFields: fields, restoredVia: via, restoredAt: now, acknowledgedAt: null, updatedAt: now })
    .where(eq(legacyProfiles.userId, snap.userId));
  await logEvent(tx, { userId: targetId, legacyUserId: snap.userId, event: `${via}_restored`, detail: { fields } });
  return fields;
}

/** Snapshot that belongs to this account: its own, or one it claimed after verifying the old email. */
async function snapshotFor(userId: string): Promise<Snapshot | undefined> {
  const [own] = await db().select().from(legacyProfiles).where(eq(legacyProfiles.userId, userId)).limit(1);
  if (own && own.status !== "claimed" && (!own.restoredTo || own.restoredTo === userId)) return own;
  const [claimed] = await db()
    .select()
    .from(legacyProfiles)
    .where(and(eq(legacyProfiles.restoredTo, userId), ne(legacyProfiles.userId, userId)))
    .orderBy(desc(legacyProfiles.restoredAt))
    .limit(1);
  return claimed;
}

/** Called on every /api/me: restores a pending snapshot automatically, then reports the state. */
export async function recoveryState(userId: string): Promise<RecoveryState> {
  let snap = await snapshotFor(userId);
  if (snap?.status === "pending" && snap.userId === userId) {
    await db().transaction(async (tx) => {
      const locked = await lockSnapshot(tx, userId);
      if (locked?.status === "pending") await applyLocked(tx, locked, userId, "auto");
    });
    snap = await snapshotFor(userId);
  }
  if (!snap) return { state: "none" };
  if (snap.status === "empty") return { state: "empty", acknowledged: Boolean(snap.acknowledgedAt) };
  if (snap.status === "dismissed") return { state: "dismissed" };
  if ((snap.status === "restored" || snap.status === "claimed") && snap.restoredTo === userId) {
    return {
      state: "restored",
      via: (snap.restoredVia ?? "import") as "import" | "auto" | "manual" | "reapply",
      fields: snap.restoredFields as RecoveredField[],
      restoredAt: (snap.restoredAt ?? snap.importedAt).toISOString(),
      acknowledged: Boolean(snap.acknowledgedAt),
    };
  }
  return { state: "none" };
}

export async function acknowledge(userId: string) {
  const snap = await snapshotFor(userId);
  if (!snap) return;
  await db().update(legacyProfiles).set({ acknowledgedAt: new Date(), updatedAt: new Date() }).where(eq(legacyProfiles.userId, snap.userId));
  await logEvent(db(), { userId, legacyUserId: snap.userId, event: "acknowledged" });
}

/** "Start fresh": remove restored values the user hasn't changed since. */
export async function startFresh(userId: string) {
  const owned = await snapshotFor(userId);
  if (!owned) throw new AppError(404, "not_found", "There's no restored profile to undo.");
  await db().transaction(async (tx) => {
    const snap = await lockSnapshot(tx, owned.userId);
    if (!snap || !(snap.status === "restored" || snap.status === "claimed") || snap.restoredTo !== userId || !snap.data) {
      throw new AppError(409, "not_restored", "There's no restored profile to undo.");
    }
    const live = await lockProfile(tx, userId);
    const patch = undoSnapshot(livePick(live), snap.data, snap.restoredFields);
    if (Object.keys(patch).length) await tx.update(profiles).set({ ...patch, updatedAt: new Date() }).where(eq(profiles.userId, userId));
    await tx.update(legacyProfiles).set({ status: "dismissed", restoredTo: userId, acknowledgedAt: new Date(), updatedAt: new Date() }).where(eq(legacyProfiles.userId, snap.userId));
    await logEvent(tx, { userId, legacyUserId: snap.userId, event: "start_fresh", detail: { cleared: Object.keys(patch) } });
  });
}

/** Restore again after "Start fresh". */
export async function reapply(userId: string) {
  const owned = await snapshotFor(userId);
  if (!owned) throw new AppError(404, "not_found", "There's no previous profile linked to this account.");
  return db().transaction(async (tx) => {
    const snap = await lockSnapshot(tx, owned.userId);
    if (!snap || snap.status !== "dismissed" || (snap.restoredTo ?? snap.userId) !== userId) {
      throw new AppError(409, "already_restored", "Your previous profile is already restored.");
    }
    return applyLocked(tx, snap, userId, "reapply");
  });
}

/* ───────────── Manual recovery into a different account ───────────── */

const hashCode = (codeId: string, code: string) => createHmac("sha256", env().BETTER_AUTH_SECRET).update(`${codeId}:${code}`).digest("hex");

/**
 * Always resolves the same way, whatever the email: the caller can't tell whether it matched anything.
 * A code is only created (and emailed to the OLD address) when an unclaimed v1 profile with information exists.
 */
export async function requestCode(requesterId: string, requesterEmail: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const [snap] = await db()
    .select()
    .from(legacyProfiles)
    .where(and(eq(legacyProfiles.sourceEmail, email), ne(legacyProfiles.status, "claimed")))
    .limit(1);
  const eligible = snap && snap.userId !== requesterId && email !== requesterEmail.toLowerCase() && snap.hasProfile && meaningfulFields(snap.data).length > 0;
  await logEvent(db(), { userId: requesterId, legacyUserId: eligible ? snap.userId : null, event: "manual_code_requested", detail: { matched: Boolean(eligible) } });
  if (!eligible) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db().transaction(async (tx) => {
    // only the newest code counts
    await tx
      .update(profileRecoveryCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(profileRecoveryCodes.requesterId, requesterId), isNull(profileRecoveryCodes.consumedAt)));
    const id = crypto.randomUUID();
    await tx.insert(profileRecoveryCodes).values({ id, requesterId, legacyUserId: snap.userId, codeHash: hashCode(id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  });
  const mail = {
    to: email,
    subject: `${code} is your Code Compass recovery code`,
    ...recoveryEmail(code),
  };
  // Send after responding so matched and unmatched requests take the same time.
  waitUntil(sendMail(mail).catch((e) => console.error("[recovery] email failed", (e as Error).message)));
}

function recoveryEmail(code: string) {
  const { text, html } = actionEmail({
    heading: `Your recovery code: ${code}`,
    body: "Someone signed in to Code Compass asked to move the profile linked to this email address into their account. If that was you, enter this code on the recovery screen. It expires in 15 minutes.",
    cta: "Open Code Compass",
    url: env().APP_URL.replace(/\/$/, "") + "/recover",
    footer: "If this wasn't you, ignore this email. Nothing changes unless the code is entered, and your old password still works.",
  });
  return { text, html };
}

async function latestCode(requesterId: string) {
  const [c] = await db()
    .select()
    .from(profileRecoveryCodes)
    .where(and(eq(profileRecoveryCodes.requesterId, requesterId), isNull(profileRecoveryCodes.consumedAt)))
    .orderBy(desc(profileRecoveryCodes.createdAt))
    .limit(1);
  return c;
}

const INVALID = () => new AppError(400, "invalid_code", "That code isn't right or has expired. Check the latest email, or request a new code.");

export async function verifyCode(requesterId: string, code: string): Promise<RecoveryPreview> {
  if (!/^\d{6}$/.test(code)) throw INVALID();
  const result = await db().transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(profileRecoveryCodes)
      .where(and(eq(profileRecoveryCodes.requesterId, requesterId), isNull(profileRecoveryCodes.consumedAt), gt(profileRecoveryCodes.expiresAt, new Date())))
      .orderBy(desc(profileRecoveryCodes.createdAt))
      .limit(1)
      .for("update");
    if (!c) return { ok: false as const };
    if (c.attempts >= MAX_CODE_ATTEMPTS) {
      await tx.update(profileRecoveryCodes).set({ consumedAt: new Date() }).where(eq(profileRecoveryCodes.id, c.id));
      await logEvent(tx, { userId: requesterId, legacyUserId: c.legacyUserId, event: "manual_code_locked" });
      return { ok: false as const, locked: true };
    }
    const expected = Buffer.from(c.codeHash, "hex");
    const given = Buffer.from(hashCode(c.id, code), "hex");
    if (!timingSafeEqual(expected, given)) {
      await tx.update(profileRecoveryCodes).set({ attempts: sql`${profileRecoveryCodes.attempts} + 1` }).where(eq(profileRecoveryCodes.id, c.id));
      await logEvent(tx, { userId: requesterId, legacyUserId: c.legacyUserId, event: "manual_code_invalid", detail: { attempt: c.attempts + 1 } });
      return { ok: false as const };
    }
    await tx.update(profileRecoveryCodes).set({ verifiedAt: new Date() }).where(eq(profileRecoveryCodes.id, c.id));
    await logEvent(tx, { userId: requesterId, legacyUserId: c.legacyUserId, event: "manual_code_verified" });
    return { ok: true as const, legacyUserId: c.legacyUserId };
  });
  if (!result.ok) {
    if ("locked" in result) throw new AppError(429, "code_locked", "Too many wrong codes. Request a new code to try again.");
    throw INVALID();
  }
  return preview(requesterId, result.legacyUserId);
}

/** What restoring would change for this user — only ever computed after the code was verified. */
async function preview(requesterId: string, legacyUserId: string): Promise<RecoveryPreview> {
  const [snap] = await db().select().from(legacyProfiles).where(eq(legacyProfiles.userId, legacyUserId)).limit(1);
  const [live] = await db().select().from(profiles).where(eq(profiles.userId, requesterId)).limit(1);
  if (!snap?.data || !live || snap.status === "claimed") throw INVALID();
  const d: SnapshotData = snap.data;
  const { fields } = mergeSnapshot(livePick(live), d, new Date());
  const all = meaningfulFields(d);
  const value = (f: RecoveredField) =>
    f === "name" ? d.name ?? "" :
    f === "yearOfStudy" ? d.yearOfStudy ?? "" :
    f === "skills" ? d.skills.join(", ") :
    f === "interests" ? d.interests.join(", ") :
    f === "whatsapp" ? `•••• ${d.whatsapp!.slice(-4)}${d.whatsappVisible ? "" : " (hidden)"}` :
    `@${d.xHandle}${d.xVisible ? "" : " (hidden)"}`;
  return {
    fields: fields.map((f) => ({ field: f, label: FIELD_LABELS[f], value: value(f) })),
    keptFromCurrent: all.filter((f) => !fields.includes(f)),
    sourceUpdatedAt: snap.sourceUpdatedAt?.toISOString() ?? null,
  };
}

export async function claim(requesterId: string, decision: "restore" | "start_fresh") {
  const c = await latestCode(requesterId);
  if (!c || !c.verifiedAt || Date.now() - c.verifiedAt.getTime() > VERIFIED_TTL_MS) {
    throw new AppError(403, "not_verified", "Verify the code from your old email address first.");
  }
  return db().transaction(async (tx) => {
    const [locked] = await tx.select().from(profileRecoveryCodes).where(eq(profileRecoveryCodes.id, c.id)).for("update");
    if (!locked || locked.consumedAt) throw new AppError(409, "already_used", "This recovery has already been completed.");
    await tx.update(profileRecoveryCodes).set({ consumedAt: new Date() }).where(eq(profileRecoveryCodes.id, c.id));
    if (decision === "start_fresh") {
      await logEvent(tx, { userId: requesterId, legacyUserId: c.legacyUserId, event: "manual_start_fresh" });
      return [] as string[];
    }
    const snap = await lockSnapshot(tx, c.legacyUserId);
    if (!snap || snap.status === "claimed") throw new AppError(409, "already_claimed", "That profile has already been recovered into an account.");
    return applyLocked(tx, snap, requesterId, "manual");
  });
}
