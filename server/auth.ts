import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { waitUntil } from "@vercel/functions";
import { betterAuth } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { db } from "./db/client.js";
import { profiles, accounts, sessions, users, verifications } from "./db/schema.js";
import { emailConfigured, env, trustedOrigins } from "./env.js";
import { actionEmail, sendMail } from "./lib/mailer.js";
import { consume } from "./lib/rate-limit.js";

/** Supabase (GoTrue) stored bcrypt hashes: $2a$/$2b$/$2y$. New and reset passwords use Better Auth's scrypt. */
const isBcrypt = (hash: string) => /^\$2[aby]\$\d{2}\$/.test(hash);

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Code Compass",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: !e.REQUIRE_EMAIL_VERIFICATION,
      requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      password: {
        hash: (password) => hashPassword(password),
        verify: async ({ hash, password }) => (isBcrypt(hash) ? bcrypt.compare(password, hash) : verifyPassword({ hash, password })),
      },
      sendResetPassword: async ({ user, url }) => {
        const mail = actionEmail({
          heading: "Reset your password",
          body: "Someone (hopefully you) asked to reset the password for your Code Compass account. The link expires in one hour.",
          cta: "Choose a new password",
          url,
          footer: "If you didn't ask for this, you can ignore this email — your password won't change.",
        });
        await sendMail({ to: user.email, subject: "Reset your Code Compass password", ...mail });
      },
    },
    emailVerification: {
      sendOnSignUp: emailConfigured(e) || e.REQUIRE_EMAIL_VERIFICATION,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        const mail = actionEmail({
          heading: "Confirm your email",
          body: "Confirm this address to finish setting up your Code Compass account.",
          cta: "Confirm email",
          url,
          footer: "If you didn't create an account, you can ignore this email.",
        });
        await sendMail({ to: user.email, subject: "Confirm your email for Code Compass", ...mail });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh expiry at most once a day
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      user: {
        create: {
          // Every account gets a (not yet discoverable) profile, replacing the old Supabase trigger.
          after: async (user) => {
            await db()
              .insert(profiles)
              .values({ userId: user.id, name: user.name?.trim() || "New member" })
              .onConflictDoNothing();
          },
        },
      },
    },
    rateLimit: {
      enabled: e.NODE_ENV !== "development",
      window: 60,
      max: 60,
      customStorage: { consume: (key, rule) => consume(`auth:${key}`, rule) },
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 15, max: 4 },
        "/reset-password": { window: 60 * 15, max: 8 },
        "/send-verification-email": { window: 60 * 15, max: 4 },
        "/get-session": false,
      },
    },
    advanced: {
      // Send emails after the response: requests for existing and unknown addresses take the same time
      // (no account enumeration by timing). On Vercel, waitUntil keeps the function alive until the send finishes.
      backgroundTasks: { handler: (p) => waitUntil(p) },
      database: { generateId: () => crypto.randomUUID() },
      ipAddress: { ipAddressHeaders: e.IP_HEADERS.split(",").map((h) => h.trim()) },
      cookiePrefix: "cc",
      useSecureCookies: e.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;
export const auth = (): Auth => (instance ??= createAuth());

export type SessionData = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
