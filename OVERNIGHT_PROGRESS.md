# Overnight progress — 11 Nov 2026

Scope: launch-readiness pass on the existing v2 (no rebuild). Nothing was deployed, migrated in production, emailed or deleted.

## Done (tested locally)

| Area | Change | Files |
|---|---|---|
| Migration (Option C) | Import default is now *deferred*: snapshots `pending`, **0** v1 profiles in Discover at launch. At first sign-in the owner's details are filled in; they confirm them + contact visibility in onboarding before appearing. `--publish-profiles` keeps the old behaviour | `scripts/legacy/transform.ts`, `scripts/migrate-legacy.ts`, `server/lib/recovery.ts` |
| Onboarding for returning users | "Welcome back" notice with restored fields, a switch per restored contact (WhatsApp masked), *Start fresh instead*; form resets after Start fresh / restore again | `src/components/app/WelcomeBack.tsx`, `src/pages/Onboarding.tsx`, `shared/schemas.ts`, `server/routes/me.ts` |
| 61 vs 31 | Reconciled from the real backup (67 accounts → 61 profile rows → 35 with details → 31 shown by v1 Browse; 26 name-only + 6 no row = 32 empty) | `MIGRATION_REPORT.md` |
| Team emails | Owner emailed on a join request; requester emailed when accepted. Confirmed addresses only, sent after the response | `server/lib/notify.ts`, `server/routes/teams.ts` |
| Abuse | 24 h wait after an owner declines a join request (stops repeat-request email spam); automatic declines (team full/closed) don't count | `server/routes/teams.ts` |
| Privacy | `/privacy` page (plain language, accurate to the code); linked from landing footer + privacy section, sign-up, Settings | `src/pages/Privacy.tsx`, `src/App.tsx`, `src/pages/Landing.tsx`, `src/pages/auth/SignUp.tsx`, `src/pages/Settings.tsx` |
| Claims | Removed "hidden details never leave our servers", "Everyone here signed up because they want to build", "teams … make it to the demo"; FAQ for returning users matches Option C; every mockup captioned "fictional" | `src/pages/Landing.tsx` |
| Old URL | 307 redirect from `code-compass-mu.vercel.app` (+ old project's deployment URLs) to `codecompass-eta.vercel.app` (compiled with `vercel build` to confirm) | `vercel.json` |
| v1 leak | SQL prepared, **not run**: replaces public SELECT policies on `profiles` and `teams` with own-row policies; verify + rollback included | `docs/supabase/close-v1-public-read.sql` |
| Cutover safety | `legacy:preflight` (read-only): schema up to date? any prod account using a v1 email with a different id? Tested both outcomes locally | `scripts/preflight-cutover.ts`, `package.json` |
| Deploy scripts | `08-preview` (email on, dev migrate, push v2), `09-fresh-backup` (read-only export + compare + preflight), `10-cutover` (asks you to type CUTOVER) + `_common.ps1`; all parse with PowerShell 7 | `deploy-local\` on your PC |
| Docs | Launch runbook, env-var table, old-URL fallback, Option C, notifications | `DEPLOYMENT.md`, `ARCHITECTURE.md`, `MIGRATION_REPORT.md`, `README.md` |

## Security audit (targeted)

Checked: every `/api/me` write uses the session user only; team edit/delete/accept/remove lock the team row and check ownership;
group-chat link only for members; join requests only for the owner; contacts filtered in SQL; strict zod bodies; URL
normalisation rejects `javascript:`/`data:`/credentials, team links https-only; bcrypt (`$2a/$2b/$2y`) verified, new
passwords scrypt; sessions HttpOnly/SameSite=Lax/Secure; rate limits on auth and API; no secrets in the repo.

Known, accepted for a side project (documented, not fixed):
- Sign-up says "already exists" for a taken email (account enumeration via sign-up; rate-limited 5 / 10 min per IP).
- 5-minute session cookie cache: after a password reset or account deletion, other devices can keep a session for up to 5 minutes.
- Team member lists (name, skills, roles) are visible to any signed-in member, including members who hid themselves from Discover.

## Tests

| Suite | Result |
|---|---|
| `npm test` (API + recovery) | 67/67 pass (49 API incl. new team-email, cooldown, email-verification tests; 18 recovery) |
| Browser flows, local production build | 19/19 main flows + 5/5 recovery flows, desktop + iPhone 13, no console errors |
| Real v1 backup → local Postgres (default import) | 20/20 verify checks; `{"pending":35,"empty":32}`; 0 profiles in Discover |
| `npm run build`, `tsc`, `eslint` | clean |
| `/privacy` on iPhone 13 | no horizontal overflow, no console errors |

## Not verified

- Nothing of tonight's work is on GitHub/Vercel yet (needs `08-preview.ps1`).
- The current Preview (step 07 build) wasn't tested in a browser — Chrome didn't respond earlier.
- Real email delivery: `SMTP_USER`/`SMTP_PASS` are not set, so email is off everywhere.
- The old-URL redirect only works once the old Vercel project builds the new `main` (see DEPLOYMENT.md → Old URL).

## Blockers / needs you

1. Gmail App Password → `SMTP_USER`, `SMTP_PASS` in `deploy-local\secrets.env`.
2. Reset the Neon `neondb_owner` password (it was pasted in chat), update `secrets.env` and the Vercel `DATABASE_URL`s.
3. `SUPABASE_DB_URL` (Session pooler) in `secrets.env` for the fresh backup.
4. Delete your test account on codecompass-eta (Settings → Delete account) if it uses your v1 email — the preflight will tell you.
5. `.github/workflows/backup.yml`: PostgreSQL 17 → 18 (4 places) + repo secrets `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`.

## Later (deliberately not built)

Per-user email preferences · in-app messaging · report/block · admin tools · Google sign-in · analytics · custom domain + Resend (lifts Gmail's ~500/day cap).
