import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres:// connection string"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
  /** Public origin of the app, e.g. https://code-compass-mu.vercel.app — used for auth callbacks and email links. */
  APP_URL: z.string().url(),
  /** Extra origins allowed to call the API with credentials (comma-separated). APP_URL is always allowed. */
  TRUSTED_ORIGINS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  /** Where locked-out users can ask for help while email isn't configured (https:// or mailto:). Public. */
  SUPPORT_URL: z
    .string()
    .regex(/^(https:\/\/|mailto:)/, "SUPPORT_URL must start with https:// or mailto:")
    .optional(),
  EMAIL_FROM: z.string().default("Code Compass <onboarding@resend.dev>"),
  /** "true" blocks sign-in until the email address is verified. Requires a working mailer. */
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Comma-separated request headers that carry the client IP (set by your host, not the client). */
  IP_HEADERS: z.string().default("x-vercel-forwarded-for,x-real-ip,x-forwarded-for"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
});

const checked = schema.superRefine((e, ctx) => {
  if (e.NODE_ENV === "production" && e.REQUIRE_EMAIL_VERIFICATION && !e.RESEND_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["REQUIRE_EMAIL_VERIFICATION"], message: "can't be true without RESEND_API_KEY — nobody could confirm their email" });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * On Vercel, APP_URL may be left unset: production falls back to the project's production domain and
 * previews to their branch/deployment URL (Vercel system env vars). Set APP_URL explicitly for a custom domain.
 */
function withVercelDefaults(src: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (src.APP_URL || !src.VERCEL_URL) return src;
  const host = src.VERCEL_ENV === "production" ? src.VERCEL_PROJECT_PRODUCTION_URL || src.VERCEL_URL : src.VERCEL_BRANCH_URL || src.VERCEL_URL;
  return { ...src, APP_URL: `https://${host}` };
}

export function env(): Env {
  if (cached) return cached;
  const parsed = checked.safeParse(withVercelDefaults(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    // Never print values — only which variables are wrong.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const trustedOrigins = () => {
  const e = env();
  const extra = (e.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // On Vercel, both the unique deployment URL and the branch alias may be used to open a preview.
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter(Boolean)
    .map((h) => `https://${h}`);
  return [...new Set([new URL(e.APP_URL).origin, ...vercel, ...extra])];
};
