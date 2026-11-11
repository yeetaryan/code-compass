# Architecture

## Overview

```
Browser ──HTTPS──▶ Vercel
                   ├── static SPA (dist/, CDN-cached, CSP)        /*  → index.html
                   └── one Node function: api/index.ts (Hono)      /api/*
                          ├── /api/auth/*   Better Auth (sessions, passwords, reset, verification)
                          ├── /api/me       own profile, onboarding, avatar
                          ├── /api/people   discovery + profile detail (privacy projection)
                          ├── /api/avatars  avatar bytes (access-checked)
                          ├── /api/teams    teams, membership, join requests
                          ├── /api/recovery v1 profile recovery (restore, start fresh, emailed-code claim)
                          └── /api/health   readiness (DB) · /api/health/live liveness
                                 │  pg pool (TCP + TLS)
                                 ▼
                          Neon Postgres (pooled endpoint)        Email: Gmail SMTP or Resend
```

**Why this shape**

* *One function, one framework.* Hono gives typed routing + middleware and runs unchanged on Vercel, a Node server,
  Cloudflare or a container — no lock-in to one host's function format.
* *Same origin.* Web and API share a domain, so session cookies are first-party (`SameSite=Lax`, `HttpOnly`,
  `Secure`) and CORS is only needed for explicitly trusted extra origins.
* *Plain Postgres.* The `pg` driver over TLS works with Neon's pooled endpoint and with any other Postgres; the
  only Neon-specific thing is the connection string.
* *No extra infrastructure.* Avatars (≤300 KB, resized in the browser) live in a separate `avatars` table instead of
  object storage. Rate limits use a Postgres table instead of Redis. Both can be swapped later (R2/S3, Upstash)
  without changing the API.

## Data model

```
users (Better Auth)            accounts (provider 'credential', password hash)   sessions   verifications
  id text PK  ◀──────────────┬─ user_id FK cascade
                             │
profiles ── user_id PK/FK ───┤   name, bio, college, degree, graduation_year, year_of_study (legacy text)
                             │   skills[] + skills_key[], interests[] + interests_key[], roles[], hackathon_interests[]
                             │   availability, projects jsonb, preferred_contact
                             │   whatsapp, linkedin_url, x_handle, github_username, website_url
                             │   *_visible booleans, discoverable, onboarded_at, avatar_version, legacy jsonb
avatars ─── user_id PK/FK ───┤   mime_type, data bytea (≤300 KB)
teams ───── owner_id FK ─────┤   name, hackathon_name, description, needed_skills[]+key, needed_roles[], timeline,
  id uuid PK                 │   max_members (2–12), contact_link (members only), status recruiting|full|closed
team_members (team_id, user_id) PK, role owner|member  — exactly one owner per team (partial unique index)
team_join_requests id, team_id, user_id, message, status pending|accepted|declined|withdrawn
                   — at most one pending request per (team, user) (partial unique index)
api_rate_limits key PK, count, window_start
legacy_profiles  user_id PK/FK (v1 account), source_email, has_profile, data jsonb (normalised v1 profile),
                 raw jsonb (original Supabase row), status pending|restored|dismissed|claimed|empty,
                 restored_to, restored_fields[], restored_via, acknowledged_at
profile_recovery_codes   hashed 6-digit codes for manual recovery (requester, target, attempts, expiry)
profile_recovery_events  audit trail (event names + field lists only — never codes, tokens or passwords)
```

* **IDs.** User ids are text holding UUIDs, so the 67 migrated Supabase UUIDs are preserved verbatim and new users get UUIDs too.
* **Tags.** Display labels are canonicalised (`js`, `Javascript` → `JavaScript`) and a parallel lowercase `*_key`
  array is stored for matching. GIN indexes back `@>` / `&&` filters; a trigram index backs name search.
* **Constraints.** Lengths, array sizes, `https` links, graduation-year range and team size are enforced by CHECK
  constraints as well as by the API (`drizzle/0001_constraints.sql`).
* **Cascades.** Deleting a user removes their profile, avatar, owned teams (and those teams' members/requests), memberships and requests.

## Request flow & authorization

1. `sessionMiddleware` resolves the Better Auth session from the cookie (5-minute signed cookie cache avoids a DB hit on most requests).
2. Every `/api/me`, `/api/people`, `/api/avatars`, `/api/teams` route requires a session (`requireAuth`).
3. Bodies are parsed with **strict** zod schemas from `shared/schemas.ts` (unknown fields rejected → no mass assignment), then links are normalised by `shared/normalize.ts`.
4. Ownership is checked inside a transaction that locks the team row (`SELECT … FOR UPDATE`) for every membership change, so concurrent accepts can't overfill a team.
5. Errors map to a single JSON shape `{ error: { code, message, fields?, requestId } }`. Unexpected errors return a generic 500 and are logged with the request id; database connectivity errors return 503 with `Retry-After`.

## Privacy model

| Data | Who can see it |
|---|---|
| Landing page | Everyone |
| Any profile, team, avatar | **Signed-in members only** |
| Profile in Discover | Onboarded (name + ≥1 skill or role) **and** `discoverable = true` |
| Profile page by URL | Same as Discover, plus: yourself, people you share a team with, and owners/requesters of a pending join request between you. Otherwise **404** (indistinguishable from "doesn't exist") |
| Each contact (email, WhatsApp, LinkedIn, X, GitHub, website) | Only if its own `*_visible` switch is on. Email defaults to hidden; WhatsApp defaults to hidden for new users; migrated users keep their original choices |
| Preferred contact | Returned only if that channel is visible |
| Team group chat link | Team members and owner only |
| Pending join requests | Team owner only |
| `legacy_profiles` (raw v1 rows, source emails), recovery codes, password hashes, sessions | Never returned by any endpoint |
| A v1 profile via manual recovery | Only after the emailed code is verified by the same signed-in account; WhatsApp masked in the review |
| A returning v1 user's restored profile | Only the owner, until they confirm it in onboarding (then the normal rules apply) |

The rule is enforced **in SQL**: `PUBLIC_PROFILE_COLUMNS` (`server/lib/profile-view.ts`) uses
`CASE WHEN p.x_visible THEN p.x_handle END`, so a hidden value is never read into the API process for another
user, let alone sent. `verify-migration.ts` and the API tests assert this.

## Historical profile recovery

Every v1 (Supabase) account gets a `legacy_profiles` snapshot during migration, keyed by its preserved user id.

* **Automatic, but confirmed by the owner (launch default, "Option C").** The import leaves snapshots `pending` and
  no v1 profile in Discover. At the owner's first sign-in the snapshot is filled into their empty profile, and they land
  in onboarding with a *Welcome back* notice listing what came back, a switch for each restored contact (pre-set to
  their v1 choice) and **Start fresh instead**. Their profile appears in Discover only when they finish onboarding.
  (`--publish-profiles` restores and publishes everything at import instead.)
* **Never overwrites.** A snapshot only fills fields that are empty in the live profile; a contact's visibility
  travels with its value. *Start fresh* clears only values that are still exactly what was restored, and the user can
  restore again later. Rules live in `server/lib/recovery-merge.ts`, shared by the import and the API.
* **Accounts with no v1 profile** (6) or a name-only one (26) are marked `empty`; onboarding explains there was nothing to bring back.
* **Manual recovery into a different account** (`/recover`): the signed-in user enters the old email; if an unclaimed
  v1 profile exists, a 6-digit code is emailed **to the old address only**. Codes are HMAC-hashed, expire in 15 minutes,
  allow 5 attempts, are bound to the requesting account, and only the newest one counts. After verification the user
  reviews the data (WhatsApp masked) and chooses *Recover my profile* or *Start fresh*. Restored contacts always come
  back **hidden** on this path (it skips onboarding's visibility switches). A recovered snapshot becomes
  `claimed`; the old account is kept but hidden from Discover so nobody is listed twice.
* **No enumeration.** `/api/recovery/request` returns the same body for every email, and emails are sent after the
  response (`waitUntil`) so timing doesn't reveal matches. The same applies to password-reset emails.

## Security controls

* Passwords: scrypt (Better Auth default) for new/reset passwords; migrated bcrypt hashes verified with `bcryptjs`. Min 8 / max 128 characters for new passwords.
* Sessions: HttpOnly, `Secure` on https, `SameSite=Lax`, 30-day expiry with daily rolling refresh; all sessions revoked on password reset; "sign out other devices".
* CSRF: Better Auth checks `Origin` against `trustedOrigins`; app API accepts only JSON or raw image bodies from the same origin.
* Rate limits (per IP for auth, per user for the API; plus a 24 h wait after an owner declines a join request): sign-in 8/min, sign-up 5/10 min, reset requests 4/15 min, team creation 10/h, join requests 30/h, profile writes 30/min, discovery 120/min.
* Input: strict zod schemas, length limits, control-character stripping, LIKE-wildcard escaping, URL normalisation (LinkedIn `/in/` profiles only, http(s) only for links, https only for team chat links), image magic-byte sniffing for avatars.
* Output: React escapes text; external links use `target="_blank" rel="noopener noreferrer nofollow"`; hrefs are built server-side from validated values.
* Headers: CSP (`script-src 'self'`, no inline scripts), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, Permissions-Policy; API responses `Cache-Control: no-store`.
* Secrets only in environment variables; `.env`, backups and migration reports are git-ignored.

## Performance

* Discovery query: one SQL statement with filters, a computed match score, `count(*) OVER ()` and `LIMIT 12 OFFSET n`. No client-side filtering, no full-table fetches.
* Indexes: GIN on skill/interest/role arrays, trigram on `lower(name)`, b-tree on discovery flags, graduation year, team status/created.
* Route-level code splitting; vendor chunks for motion, TanStack Query and the auth client. Initial JS ≈ 150 KB gzip.
* Avatars cached `immutable` with versioned URLs; skills/interests suggestion endpoint cached 5 minutes.
* Cold starts: the pool waits up to 15 s for a connection; GET requests retry on 503 with backoff in the browser.

## Extending

* **LinkedIn OAuth (future):** Better Auth has a LinkedIn social provider. Adding it creates rows in `accounts`
  with `provider_id = 'linkedin'`; the profile's `linkedin_url` stays user-controlled. It requires a LinkedIn
  developer app; profile imports beyond basic OpenID claims need LinkedIn partner approval, so v1 deliberately uses a
  pasted URL only — nothing is scraped or imported.
* **Notifications:** `server/lib/notify.ts` emails the owner about a new join request and the requester when accepted,
  only to confirmed addresses, after the response. A declined requester waits 24 h before asking again. More events
  would go in the same file; per-user email preferences would be a boolean on `profiles`.
* **Object storage:** replace the `avatars` table reads/writes in `routes/me.ts` / `routes/people.ts` with R2/S3 signed URLs.
