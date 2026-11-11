/**
 * Team notifications — two plain emails, nothing more:
 *   • the owner hears about a new join request
 *   • the requester hears when they're accepted
 * Only confirmed addresses get them (an unconfirmed address may not belong to the account holder).
 * Sent after the response; failures are logged by sendMail and never affect the request.
 */
import { waitUntil } from "@vercel/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { teams, users } from "../db/schema.js";
import { env } from "../env.js";
import { actionEmail, sendMail } from "./mailer.js";

async function recipient(userId: string) {
  const [u] = await db().select({ email: users.email, verified: users.emailVerified }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.verified ? u.email : null;
}

const nameOf = async (userId: string) =>
  (await db().execute<{ name: string }>(sql`SELECT name FROM profiles WHERE user_id = ${userId}`)).rows[0]?.name ?? "Someone";

const teamUrl = (teamId: string) => `${env().APP_URL}/teams/${teamId}`;

function background(task: () => Promise<void>) {
  waitUntil(task().catch((e) => console.error("[notify] failed", (e as Error).message)));
}

export function notifyJoinRequest(teamId: string, requesterId: string, message: string | null) {
  background(async () => {
    const [t] = await db().select({ name: teams.name, ownerId: teams.ownerId }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!t) return;
    const to = await recipient(t.ownerId);
    if (!to) return;
    const who = await nameOf(requesterId);
    const note = message?.trim() ? ` Their note: “${message.trim().slice(0, 300)}”` : "";
    await sendMail({
      to,
      subject: `${who} wants to join ${t.name}`,
      ...actionEmail({
        heading: `New request to join ${t.name}`,
        body: `${who} asked to join your team on Code Compass.${note}`,
        cta: "Review the request",
        url: teamUrl(teamId),
        footer: "You're getting this because you own this team on Code Compass.",
      }),
    });
  });
}

export function notifyAccepted(teamId: string, requesterId: string) {
  background(async () => {
    const to = await recipient(requesterId);
    if (!to) return;
    const [t] = await db().select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!t) return;
    await sendMail({
      to,
      subject: `You're on ${t.name}`,
      ...actionEmail({
        heading: `You're on ${t.name}`,
        body: "The owner accepted your request. Open the team page to see your teammates and the group chat link.",
        cta: "Open the team",
        url: teamUrl(teamId),
        footer: "You're getting this because you asked to join this team on Code Compass.",
      }),
    });
  });
}
