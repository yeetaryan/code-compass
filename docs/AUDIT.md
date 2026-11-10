# Code Compass — Phase 1 Audit

Audit date: 10 Nov 2026. Inputs: `code-compass-main.zip` (source snapshot, files dated 6 Aug 2025) and
`db_cluster-09-10-202606-12-32.backup.gz` (Supabase cluster dump). The live Supabase project and the live
GitHub repository were **not** accessible from the build environment, so every statement about "live" state
below is either quoted from the brief or explicitly marked as unverified.

---

## 1. Source code

### 1.1 Stack and structure

| Area | Finding |
|---|---|
| Tooling | Vite 5 + React 18 + TS 5, Tailwind 3, shadcn/ui (49 generated components, ~6 actually used), `lovable-tagger` dev plugin |
| Routing | React Router 6: `/`, `/profile`, `/browse`, `/teams`, `/auth`, `*` |
| Data | `@supabase/supabase-js` called directly from page components. TanStack Query is installed and wrapped around the app but **never used** |
| Auth | `useAuth` context over `supabase.auth.onAuthStateChange`; session in `localStorage` |
| App code | ~1,550 lines across 6 pages + 3 components. All business logic lives in the pages |
| Config | `vercel.json` SPA rewrite only. Supabase URL + anon key hard-coded in `src/integrations/supabase/client.ts` (the anon key is public by design, but it means the database is directly reachable by anyone who opens the bundle) |
| Tests | None. No CI. No `.env.example`. README is a 30-line stub |

### 1.2 Feature map

| Feature | Original behaviour | Gaps |
|---|---|---|
| Sign up | email + password + name, Supabase confirmation email | No password reset, no "resend confirmation", no validation beyond `required`, raw Supabase error text shown |
| Login / logout | works | `Auth` page redirects with `getUser()` on mount; no protected-route component (each page checks itself) |
| Profile | single form: name, year (free text), skills (comma text), interests (free text), WhatsApp, X handle, 2 visibility toggles | No college, bio, roles, availability, LinkedIn, avatar, projects. No validation or length limits. `upsert` sends whatever the client wants |
| Browse | fetches **every** profile with `select('*')`, filters client-side, hides WhatsApp/X with `&&` in JSX | See §3 — private data is downloaded to every visitor. No pagination, no filters, shows `STATUS: ONLINE` for everyone and "Active: N days ago" computed from *signup* date |
| Teams | create form + list of all teams | Create only. No edit, delete, join, leave, members, ownership UI. `whatsapp_group` link is unvalidated |
| Landing | terminal theme, MUJ-specific copy | Hard-coded fake stats: "Active Users: 127", "Response rate: 92.1%", random "Query executed in 0.xxx ms" |

### 1.3 Responsive behaviour
Nav is a single flex row of 5 links with no mobile menu (overflows < ~380 px). Grids collapse correctly. Forms are usable but
dense; monospace everywhere hurts readability on phones.

---

## 2. Database backup

### 2.1 Format
`gzip` → plain-text SQL produced by `pg_dumpall` (cluster dump: roles, `template1`, `postgres` DB). It begins with
`\restrict` (pg_dump ≥ 17.6 / 16.10 meta-command), so it needs a recent `psql` and is **not** a `pg_restore` custom archive.
Uncompressed size 610 KB.

It must not be restored wholesale into Neon: it creates 15 Supabase roles, extensions (`pg_graphql`, `supabase_vault`,
`pgsodium`-style objects), event triggers, and the `auth`, `storage`, `realtime`, `vault`, `graphql*`, `pgbouncer`,
`supabase_migrations` schemas, which would fail or pollute a vanilla Postgres.

### 2.2 Schemas and row counts (non-empty tables only)

| Table | Rows | Migrate? |
|---|---:|---|
| `auth.users` | 67 | **Yes** → `user` + `account` |
| `auth.identities` | 67 (all `provider = email`, 1 per user) | Used only for cross-checks |
| `public.profiles` | 61 | **Yes** → `profiles` |
| `public.teams` | **0** | Mapping implemented, nothing to move (matches the brief's "zero teams") |
| `auth.sessions` / `refresh_tokens` / `mfa_amr_claims` | 60 / 177 / 60 | No — old sessions are meaningless after the auth switch |
| `auth.audit_log_entries` | 535 | No (contains IPs; kept only in the original backup) |
| `auth.one_time_tokens` | 13 | No (pending confirmation/recovery tokens, unusable outside Supabase) |
| `storage.objects` / `storage.buckets` | **0 / 0** | Nothing to move — no avatars or uploads were ever stored |
| `vault.secrets` | 0 | — |
| `*.schema_migrations` | platform bookkeeping | No |

### 2.3 Application schema (original)

```
public.profiles (id uuid PK → auth.users.id ON DELETE CASCADE, name, year, skills, interests,
                 whatsapp, twitter, whatsapp_visible bool default true, twitter_visible bool default true,
                 created_at, updated_at)
public.teams    (id uuid PK, user_id uuid NOT NULL  -- no FK!, team_name, hackathon_name, needed_skills,
                 timeline, whatsapp_group, description, created_at, updated_at)
```
Triggers: `on_auth_user_created` (creates a profile row from `raw_user_meta_data->>'name'`), `update_*_updated_at`.
Indexes: primary keys only. RLS: SELECT `USING (true)` on both tables (readable by `anon`), insert/update/delete own rows.
Grants: `GRANT ALL` on both tables to `anon` and `authenticated`.

### 2.4 Authentication data

* All 67 password hashes are **bcrypt `$2a$10$`** (60 chars). Better Auth defaults to scrypt but accepts custom
  `password.hash` / `password.verify` functions, so the hashes can be kept and verified with `bcryptjs`.
  → Implemented and tested in Phase 2 (see `MIGRATION_REPORT.md`): existing users keep their passwords.
* 54 confirmed emails, **13 never confirmed and never signed in**. All emails already lowercase, no duplicates,
  no SSO/anonymous/phone/banned/deleted users. Single provider (`email`).
* `raw_user_meta_data` keys: `name, email, sub, email_verified, phone_verified` — nothing extra to preserve.

### 2.5 Data quality and inconsistencies

| Issue | Count | Handling |
|---|---:|---|
| Users with **no profile row** (all confirmed, all signed in once, Jul–Aug 2025). The trigger should have created one; the RLS DELETE policy allowed users to delete their own row, which is the most likely cause, but this can't be proven from the dump | 6 | Migrate the account; create an empty, non-discoverable profile so they land in onboarding |
| Profiles with no user | 0 | — |
| Profiles visible in old Browse (name + skills or interests) | 31 of 61 | New Browse shows only profiles that completed onboarding (name + ≥1 skill or role) |
| `year` is free text with 16 spellings ("3rd year", "3rd Year", "3rd", "1", "2025", "N/A", blank…) | 61 | Kept verbatim as `year_of_study`. **Not** converted to a graduation year — that would be a guess. Users are prompted to add a graduation year |
| `skills` / `interests` are comma-separated free text ("Js", "javascript", "JAVASCRIPT"; "AI/Ml", "AI-ML", "AI and ML") | 30 / 23 non-empty | Split, trimmed, de-duplicated and mapped to canonical labels (`server/lib/tags.ts`). Original text kept in `profiles.legacy` |
| WhatsApp: 14 bare 10-digit numbers, 7 `+` E.164, **1 nine-digit (invalid)** | 22 | 10-digit numbers matching Indian mobile pattern `[6-9]\d{9}` get `+91` (the original UI was MUJ-only and built `wa.me/` links that were broken without a country code). Invalid values are not migrated to the live field but are kept in `legacy` |
| X/Twitter: handles with and without `@`, one full `https://x.com/...` URL | 10 | Normalised to bare handle |
| Leading/trailing whitespace | 11 | Trimmed |
| `teams.user_id` has no FK | schema | New schema has FKs everywhere |

### 2.6 Backup vs. live database — discrepancies to resolve at cutover
* The dump's newest user was created **15 Apr 2026**; the filename suggests the dump itself was taken on 9 Oct 2026
  (or 10 Sep 2026 — the `dd-mm` order is ambiguous). Any sign-ups after the dump will be missing.
  **Mitigation:** the migration script is idempotent (`ON CONFLICT DO NOTHING`); take a fresh dump immediately before cutover and re-run it.
* Live team count could not be verified (no dashboard access); both the brief and the backup say 0.

---

## 3. Security findings in the original app

| # | Severity | Finding |
|---|---|---|
| S1 | **High** | **Hidden contact details are public.** RLS allows `SELECT *` on `profiles` to `anon`. The anon key ships in the JS bundle, so anyone can run `supabase.from('profiles').select('*')` and get every WhatsApp number and X handle — including the **5 WhatsApp numbers and 2 X handles that their owners had set to hidden**. Browse also downloads them to every visitor; the toggle only affected rendering. |
| S2 | **High** | **Stored XSS / tab-nabbing via team links.** `whatsapp_group` is free text opened with `window.open(team.whatsapp_group, '_blank')`. A `javascript:` URL is not filtered by Supabase, and `window.open` without `noopener` gives the opened page `window.opener`. |
| S3 | Medium | No input validation or length limits on any column — a single profile or team can store megabytes; profiles can be upserted with any field set. |
| S4 | Medium | `teams.user_id` has no FK; teams can outlive their owner. `GRANT ALL` to `anon` makes the RLS policies the *only* line of defence. |
| S5 | Medium | No password reset flow at all → locked-out users had no recovery path. |
| S6 | Low | Fabricated metrics in the UI (127 active users, 92.1% response rate, everyone "ONLINE"). Not a vulnerability, but it misleads users and recruiters. |
| S7 | Low | Raw backend error messages shown to users (`error.message`), revealing auth state (e.g. "Email not confirmed"). |
| S8 | Info | `auth.audit_log_entries` in the backup contains user IP addresses — the backup file is personal data and must stay out of git (handled via `.gitignore`). |

---

## 4. Migration risks

1. **Password compatibility** — bcrypt is compatible via custom verify. Risk retired once tested (Phase 2).
2. **13 unconfirmed accounts** — migrated with `emailVerified = false`. If email verification is required at login, they must verify through the new mailer; otherwise they can log in normally.
3. **Email delivery** — password reset and verification need a mail provider (Resend). Without a verified sending domain, Resend only delivers to the account owner's address. Until configured, reset links are logged server-side only.
4. **Sessions** — every user will be signed out once at cutover (unavoidable, by design).
5. **Stale backup** — see §2.6.
6. **No live access** — schema drift between the zip and the live repo/database can't be ruled out; the migration validates input shape and fails loudly rather than guessing.

---

## 5. Implementation plan (summary)

1. **Schema & auth** — Drizzle schema (Better Auth core tables + `profiles`, `avatars`, `teams`, `team_members`, `team_join_requests`, `api_rate_limits`), versioned SQL migrations, Better Auth with bcrypt-compatible verify and UUID ids.
2. **ETL** — `scripts/migrate-legacy.ts` reads the dump file directly (no restore of Supabase internals), transforms, loads in one transaction, writes a JSON report; `scripts/verify-migration.ts` checks counts, FKs, orphans and a real login.
3. **API** — Hono app (portable: Vercel function in prod, Node server in dev) with zod validation, session middleware, ownership checks, privacy-aware SQL projections, DB-backed rate limiting, health check.
4. **UI** — new design system and every page rebuilt; TanStack Query for data; LinkedIn + X as independent optional links with their own visibility.
5. **Tests** — API integration tests against a real Postgres, browser flows with Playwright, mobile screenshots.
6. **Docs** — README, ARCHITECTURE, DEPLOYMENT, DATABASE_BACKUP, MIGRATION_REPORT, `.env.example`.
