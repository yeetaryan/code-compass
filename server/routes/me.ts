import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Me } from "../../shared/api-types.js";
import { LIMITS } from "../../shared/constants.js";
import {
  cleanText,
  normalizeGithub,
  normalizeLinkedIn,
  normalizeWebUrl,
  normalizeWhatsapp,
  normalizeXHandle,
} from "../../shared/normalize.js";
import { onboardingSchema, profileUpdateSchema } from "../../shared/schemas.js";
import { normalizeTags } from "../../shared/tags.js";
import { db } from "../db/client.js";
import { avatars, profiles, teamJoinRequests, teams, users } from "../db/schema.js";
import { AppError, body, currentUser, rateLimit, requireAuth, type AppEnv } from "../lib/http.js";
import { meetsOnboarding, toMyProfile } from "../lib/profile-view.js";

export const me = new Hono<AppEnv>();
me.use("*", requireAuth);

async function loadProfile(userId: string, name: string) {
  const rows = await db().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  // Self-heal: an account without a profile row (6 such legacy users) gets one on first visit.
  const [created] = await db().insert(profiles).values({ userId, name: name || "New member" }).onConflictDoNothing().returning();
  return created ?? (await db().select().from(profiles).where(eq(profiles.userId, userId)).limit(1))[0];
}

async function buildMe(userId: string): Promise<Me> {
  const [u] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new AppError(401, "unauthenticated", "Please sign in again");
  const p = await loadProfile(u.id, u.name);
  const [pending] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(teamJoinRequests)
    .innerJoin(teams, eq(teams.id, teamJoinRequests.teamId))
    .where(and(eq(teams.ownerId, userId), eq(teamJoinRequests.status, "pending")));
  return {
    user: { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, createdAt: u.createdAt.toISOString() },
    profile: toMyProfile(p),
    pendingRequestsToReview: pending?.n ?? 0,
  };
}

me.get("/", async (c) => c.json(await buildMe(currentUser(c).id)));

me.post("/onboarding", rateLimit("profile-write", { window: 60, max: 30 }), async (c) => {
  const user = currentUser(c);
  const input = await body(c, onboardingSchema);
  const skills = normalizeTags(input.skills, LIMITS.skills);
  const existing = await loadProfile(user.id, user.name);
  const next = { name: input.name, skills: skills.labels, roles: input.roles };
  if (!meetsOnboarding(next)) throw new AppError(400, "validation_failed", "Add at least one skill or role");
  await db()
    .update(profiles)
    .set({
      name: input.name,
      college: input.college,
      graduationYear: input.graduationYear,
      skills: skills.labels,
      skillsKey: skills.keys,
      roles: input.roles,
      availability: input.availability,
      onboardedAt: existing.onboardedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id));
  await db().update(users).set({ name: input.name, updatedAt: new Date() }).where(eq(users.id, user.id));
  return c.json(await buildMe(user.id));
});

me.put("/profile", rateLimit("profile-write", { window: 60, max: 30 }), async (c) => {
  const user = currentUser(c);
  const input = await body(c, profileUpdateSchema);
  const existing = await loadProfile(user.id, user.name);

  const skills = normalizeTags(input.skills, LIMITS.skills);
  const interests = normalizeTags(input.interests, LIMITS.interests);
  const hackathons = normalizeTags(input.hackathonInterests, LIMITS.hackathons);
  const projects = input.projects.map((p, i) => ({
    title: cleanText(p.title, LIMITS.projectTitle)!,
    url: normalizeWebUrl(p.url, `projects.${i}.url`),
    description: p.description ?? null,
  }));

  const contact = {
    whatsapp: normalizeWhatsapp(input.whatsapp),
    linkedinUrl: normalizeLinkedIn(input.linkedinUrl),
    xHandle: normalizeXHandle(input.xHandle),
    githubUsername: normalizeGithub(input.githubUsername),
    websiteUrl: normalizeWebUrl(input.websiteUrl, "websiteUrl"),
  };

  const onboardedNow = meetsOnboarding({ name: input.name, skills: skills.labels, roles: input.roles });
  if (input.preferredContact) {
    const has: Record<string, boolean> = {
      email: true,
      whatsapp: !!contact.whatsapp,
      linkedin: !!contact.linkedinUrl,
      x: !!contact.xHandle,
      github: !!contact.githubUsername,
      website: !!contact.websiteUrl,
    };
    if (!has[input.preferredContact] || !input.visibility[input.preferredContact]) {
      throw new AppError(400, "validation_failed", "Your preferred contact method must be filled in and visible", {
        preferredContact: "Choose a method that's filled in and visible",
      });
    }
  }

  await db()
    .update(profiles)
    .set({
      name: input.name,
      bio: input.bio,
      college: input.college,
      degree: input.degree,
      graduationYear: input.graduationYear,
      skills: skills.labels,
      skillsKey: skills.keys,
      interests: interests.labels,
      interestsKey: interests.keys,
      roles: input.roles,
      hackathonInterests: hackathons.labels,
      availability: input.availability,
      projects,
      preferredContact: input.preferredContact,
      ...contact,
      emailVisible: input.visibility.email,
      whatsappVisible: input.visibility.whatsapp,
      linkedinVisible: input.visibility.linkedin,
      xVisible: input.visibility.x,
      githubVisible: input.visibility.github,
      websiteVisible: input.visibility.website,
      discoverable: input.discoverable,
      onboardedAt: onboardedNow ? (existing.onboardedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id));
  if (input.name !== user.name) await db().update(users).set({ name: input.name, updatedAt: new Date() }).where(eq(users.id, user.id));
  return c.json(await buildMe(user.id));
});

/* ── Avatars: small images (client resizes to ≤512px WebP) stored in Postgres ── */

function sniffImage(buf: Buffer): "image/webp" | "image/jpeg" | "image/png" | null {
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

me.put("/avatar", rateLimit("avatar", { window: 3600, max: 20 }), async (c) => {
  const user = currentUser(c);
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > LIMITS.avatarBytes) throw new AppError(413, "too_large", "Images must be under 300 KB");
  const buf = Buffer.from(await c.req.arrayBuffer());
  if (buf.length === 0) throw new AppError(400, "empty", "No image received");
  if (buf.length > LIMITS.avatarBytes) throw new AppError(413, "too_large", "Images must be under 300 KB");
  const mime = sniffImage(buf);
  if (!mime) throw new AppError(415, "unsupported_type", "Upload a JPEG, PNG or WebP image");
  await loadProfile(user.id, user.name);
  await db().transaction(async (tx) => {
    await tx
      .insert(avatars)
      .values({ userId: user.id, mimeType: mime, data: buf, byteSize: buf.length })
      .onConflictDoUpdate({ target: avatars.userId, set: { mimeType: mime, data: buf, byteSize: buf.length, updatedAt: new Date() } });
    await tx
      .update(profiles)
      .set({ avatarVersion: sql`abs(${profiles.avatarVersion}) + 1`, updatedAt: new Date() })
      .where(eq(profiles.userId, user.id));
  });
  return c.json(await buildMe(user.id));
});

me.delete("/avatar", async (c) => {
  const user = currentUser(c);
  await db().transaction(async (tx) => {
    await tx.delete(avatars).where(eq(avatars.userId, user.id));
    // keep the counter (negated) so a later upload gets a fresh, cache-busting version number
    await tx
      .update(profiles)
      .set({ avatarVersion: sql`-abs(${profiles.avatarVersion})`, updatedAt: new Date() })
      .where(eq(profiles.userId, user.id));
  });
  return c.json(await buildMe(user.id));
});
