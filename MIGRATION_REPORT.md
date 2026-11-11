# Migration report — Supabase → Neon / Better Auth

**Status:** migration tooling built and verified against a local PostgreSQL 16 stand-in for Neon (re-run 11 Nov 2026 with
the launch strategy below). **Not yet run against Neon production** — that waits for your approval (`deploy-local\10-cutover.ps1`).
The original Supabase project and backup were not modified.

**Launch strategy (Option C):** every v1 account, password hash and profile is preserved, but no v1 profile is shown
in Discover at launch. When the owner signs in, their old details are filled into their profile and they confirm them
(and who can see their WhatsApp / X) in onboarding; only then do they appear in Discover.

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
| name + (skills or interests) present | (with `--publish-profiles` only) `onboarded_at = updated_at` | Default (Option C): `onboarded_at` stays empty until the owner confirms in onboarding |
| whole original row | `legacy_profiles.raw` jsonb | Audit trail + basis for profile recovery; never returned by the API |
| normalised v1 profile | `legacy_profiles.data` jsonb, status `pending` / `empty` | Filled in at the owner's first sign-in; powers "Welcome back", Start fresh / restore again, and verified manual recovery |
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
normalised; 0 tags dropped.

### What the numbers mean (61 vs 31 vs 35)

| Number | What it counts |
|---:|---|
| **67** | v1 accounts (`auth.users`) — all migrated with the same id, email, password hash and timestamps |
| **61** | v1 profile rows (`public.profiles`). The other **6** accounts had no profile row at all |
| **35** | of the 61, profiles with *something to bring back* beyond a name (year, skills, interests, WhatsApp or X) → snapshot `pending` |
| **31** | of the 35, profiles v1's Browse page actually showed (name + skills or interests). The other **4** had only a year and/or contacts |
| **26** | of the 61, profiles with a name only → snapshot `empty` (6 + 26 = **32** `empty`) |
| **21 / 17** | valid WhatsApp numbers / of which marked visible in v1 (v1 defaulted the switch to *on*) |
| **10 / 8** | X handles / of which marked visible |
| **0** | v2 profiles in Discover right after the import (Option C); each appears once its owner signs in and confirms |

So "61 profiles" (rows in the old database) and "31 visible" (what v1's Browse showed) were both right; they count different things.

### Verification (`npm run legacy:verify`) — 20/20 passed (re-run 11 Nov 2026, default Option C import)

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
PASS  snapshot status summary  ({"pending":35,"empty":32})
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
5. **v1 profiles aren't in Discover at launch** (Option C). They appear as their owners return. To show all 31 at once instead, run the import with `--publish-profiles` (v1 visibility switches are then applied as-is).
6. **Graduation year** isn't inferred from "3rd year"-style text; users are prompted to set it.
7. **1 WhatsApp number** was invalid and isn't restored; its owner can re-enter it. The original value is kept in `legacy_profiles.raw`.
8. **6 users had no profile row** in Supabase (likely deleted by them — v1's RLS allowed it; can't be proven). They get an empty, non-discoverable profile and land in onboarding.
9. Timestamps are stored at millisecond rather than microsecond precision.

## Rollback

The import only inserts. To undo it on a target: restore the Neon branch to a point before the run (or drop and
re-create the database and re-run `db:migrate`). The Supabase source is never written to.
