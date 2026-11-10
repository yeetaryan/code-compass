# Migration report — Supabase → Neon / Better Auth

**Status:** migration tooling built and verified against a local PostgreSQL 16 stand-in for Neon (10 Nov 2026).
**Not yet run against Neon production** — no credentials were available in the build environment. The original
Supabase project and backup were not modified.

## Source

| | |
|---|---|
| File | `db_cluster-09-10-202606-12-32.backup.gz` — gzip, plain-text `pg_dumpall` (cluster dump) |
| SHA-256 | `fc20f7c1a3751471a731299adca7b0909db36ec4641eb597d5b366047d4908ce` (unchanged after the run) |
| Newest user in dump | 15 Apr 2026 |
| Live Supabase DB | Not inspected (no access). Brief states 0 teams — matches the dump |

Only four tables are read: `auth.users`, `auth.identities`, `public.profiles`, `public.teams`. Supabase-managed
schemas (`storage`, `realtime`, `vault`, `graphql`, `pgbouncer`, `supabase_migrations`, auth internals such as
sessions, refresh tokens, MFA, audit log) are ignored. Storage had 0 buckets and 0 objects, so there were no files
to move.

## Method

`scripts/migrate-legacy.ts` parses the COPY blocks straight out of the dump (no restore of Supabase internals),
transforms rows with pure functions (`scripts/legacy/transform.ts`), and inserts everything in **one transaction**
with `ON CONFLICT DO NOTHING` — so it is atomic, additive and safe to re-run against a fresher dump. Non-local
targets require `--confirm-host <hostname>`. A JSON report (row ids only, no emails) is written to
`migration-output/` (git-ignored).

## Mapping

| Supabase | New | Notes |
|---|---|---|
| `auth.users.id` | `users.id` | **Preserved verbatim** (UUID as text) |
| `auth.users.email` | `users.email` | Lower-cased (all already were) |
| `email_confirmed_at IS NOT NULL` | `users.email_verified` | 54 true, 13 false |
| `created_at`, `updated_at` | same | Preserved (millisecond precision; Postgres microseconds are truncated by JS) |
| `encrypted_password` (bcrypt `$2a$10$`) | `accounts.password`, `provider_id = 'credential'` | **Copied byte-for-byte**; verified at sign-in with bcrypt. New/reset passwords use scrypt |
| `auth.identities.id` | `accounts.id` | Keeps the original identity id for traceability |
| `profiles.name` | `profiles.name` (+ `users.name`) | Falls back to signup metadata, then email local-part |
| `profiles.year` (free text) | `profiles.year_of_study` | Kept verbatim; shown until the user picks a graduation year. **Not** guessed into `graduation_year` |
| `profiles.skills` / `interests` (comma text) | `skills[]` / `interests[]` + lowercase `*_key[]` | Split, trimmed, de-duplicated, canonicalised ("Js" → "JavaScript", "AI/Ml" → "AI/ML", "web devlopment" → "Web Development") |
| `profiles.whatsapp` | `profiles.whatsapp` (E.164) | `+…` kept; bare 10-digit `[6-9]…` → `+91…`; invalid → not migrated (kept in `legacy`) |
| `profiles.twitter` | `profiles.x_handle` | `@handle`, `handle` or `x.com/…` URL → bare handle |
| `whatsapp_visible`, `twitter_visible` | `whatsapp_visible`, `x_visible` | **User choices preserved** |
| — | `email_visible` | `false` (email was never shown in v1) |
| name + (skills or interests) present | `onboarded_at = updated_at` | Same rule as v1's Browse filter, so the same 31 people stay discoverable |
| whole original row | `legacy_profiles.raw` jsonb | Audit trail + basis for profile recovery; never returned by the API |
| normalised v1 profile | `legacy_profiles.data` jsonb, status `restored` / `empty` | Powers "Welcome back", Start fresh / restore again, and verified manual recovery |
| `teams.*` | `teams` + owner row in `team_members` | 0 rows in source. `whatsapp_group` kept only if `https://` (a `javascript:` URL is dropped — tested) |

## Results (local run against the real backup)

| | Source | Migrated | Check |
|---|---:|---:|---|
| Users | 67 | 67 | ids, emails, verification state, hashes, timestamps identical |
| Credential accounts | 67 identities | 67 | |
| Profiles | 61 | 67 | 61 migrated + **6 created empty** for users who had none |
| Teams | 0 | 0 | |
| Skipped rows | — | 0 | |
| Re-run | — | 0 inserted, 67 already present | idempotent |

Transformations: 14 WhatsApp numbers given `+91`, 7 kept as-is, **1 invalid (9 digits) not migrated**; 10 X handles
normalised; 31 profiles discoverable immediately; 30 profiles (name only) need to add a skill or role to appear in
Discover; 0 tags dropped.

Recovery snapshots: 67 written — 35 `restored` at import (had skills, interests, year or contacts), 32 `empty`
(6 with no profile row, 26 with a name only).

### Verification (`npm run legacy:verify`) — 20/20 passed (re-run 11 Nov 2026 with recovery snapshots)

```
PASS  every source user exists with the same id  (67/67)
PASS  emails preserved  (0 mismatches)
PASS  email verification state preserved  (0 mismatches)
PASS  bcrypt password hashes preserved byte-for-byte  (0 mismatches)
PASS  signup timestamps preserved (ms precision)  (0 mismatches)
PASS  every source profile migrated  (61/61)
PASS  visibility choices preserved  (0 mismatches)
PASS  profile timestamps preserved  (0 mismatches)
PASS  every v1 account has a recovery snapshot  (67/67)
PASS  snapshot emails match the v1 accounts  (0 mismatches)
PASS  original v1 rows kept in legacy_profiles.raw  (0 missing)
PASS  accounts without a v1 profile are marked empty  (6 such accounts)
PASS  snapshot status summary  ({"restored":35,"empty":32})
PASS  every user has a profile row  (0 without)
PASS  legacy teams migrated  (0/0)
PASS  every team has its owner as a member
PASS  foreign keys present  (15 FKs)
PASS  no orphaned rows  (0 orphans)
PASS  search indexes present  (37 indexes)
PASS  hidden contacts never exposed by the public projection  (0 leaks)
```

### Authentication compatibility — tested

Real user passwords are unknown (as they should be), so compatibility was proven with a synthetic Supabase-format
dump (`tests/helpers.ts`) containing `$2a$` bcrypt hashes for known passwords, run through the same migration
script. Automated tests confirm that a migrated user:

* signs in with the original password — including a **6-character** password (Supabase's old minimum; v2 requires 8 only for *new* passwords),
* keeps the same user id,
* is rejected with a generic message for a wrong password,
* can reset the password by email, after which the old one stops working.

Run `legacy:verify --login-email … --login-password …` with **your own** account after the real import for a final check.

## Known limitations

1. **Everyone is signed out once.** Supabase sessions/refresh tokens can't be used by Better Auth.
2. **13 never-confirmed accounts** are migrated with `email_verified = false`. With `REQUIRE_EMAIL_VERIFICATION=false` (default) they can sign in normally; if you turn it on, they must confirm via email first.
3. **Password reset needs email.** It works with either Resend (needs a domain) or SMTP such as a Gmail account with an App Password (no domain). Until one is configured, reset links can't be sent and the Forgot-password page says so.
4. **Stale dump.** Accounts created after the dump was taken are missing until you re-run the import with a fresh backup at cutover (idempotent).
5. **Graduation year** isn't inferred from "3rd year"-style text; users are prompted to set it.
6. **1 WhatsApp number** was invalid and isn't shown; its owner can re-enter it. The original value is kept in `profiles.legacy`.
7. **6 users had no profile row** in Supabase (likely deleted by them — v1's RLS allowed it; can't be proven). They get an empty, non-discoverable profile and land in onboarding.
8. Timestamps are stored at millisecond rather than microsecond precision.

## Rollback

The import only inserts. To undo it on a target: restore the Neon branch to a point before the run (or drop and
re-create the database and re-run `db:migrate`). The Supabase source is never written to.
