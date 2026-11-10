# Deployment — Vercel + Neon

Nothing here has been run against your real accounts yet: the build environment had no access to GitHub, Vercel,
Neon or Supabase. Every step was rehearsed locally (production build, production-mode handler, migrations, legacy
import, verification, browser tests). Steps marked **⚠︎** change shared state; do them in order.

## 0. What you need

| Item | Where | Notes |
|---|---|---|
| GitHub repo | `yeetaryan/code-compass` | Push v2 to a branch first (see §1) |
| Neon account | neon.com | Free plan is enough to launch |
| Vercel account | vercel.com | The existing project behind `code-compass-mu.vercel.app` |
| Supabase dashboard | supabase.com | Only to take a fresh backup at cutover |
| Resend account + a domain you control | resend.com | Needed for password-reset emails to reach users |
| `openssl` | your machine | To generate `BETTER_AUTH_SECRET` |

## 1. Source control

```bash
git clone https://github.com/yeetaryan/code-compass.git && cd code-compass
git tag v1-lovable && git push origin v1-lovable          # permanent pointer to the original app
git checkout -b v2
# copy this project's files in (everything except node_modules, dist, private/, migration-output/, .env)
git add -A && git commit -m "Code Compass v2: Neon + Better Auth + redesign"
git push -u origin v2
```

Open a PR from `v2` → `main` but don't merge until §6. Confirm `git status` shows no `.env`, `private/` or `*.backup*` files.

## 2. Neon

1. Create a project (Postgres 16 or 17). Pick the region closest to your users — and use the **same** region for Vercel functions (§4) so each query doesn't cross an ocean.
2. Neon creates a `main` branch → this is **production**. Create a second branch `dev` from it → **development/preview**.
3. For each branch, copy the **pooled** connection string (host contains `-pooler`, ends with `?sslmode=require`).
4. Apply the schema to both:
   ```bash
   DATABASE_URL="<dev pooled url>"  npm run db:migrate
   DATABASE_URL="<prod pooled url>" npm run db:migrate        # ⚠︎ creates tables in production
   ```
   Migrations only create objects; they never drop data.

## 3. Rehearse the data migration on `dev`

```bash
# a fresh backup: Supabase dashboard → Database → Backups → download, save under ./private/ (git-ignored)
npm run legacy:migrate -- --dump ./private/<backup>.backup.gz --dry-run
DATABASE_URL="<dev pooled url>" npm run legacy:migrate -- --dump ./private/<backup>.backup.gz --confirm-host <dev host>
DATABASE_URL="<dev pooled url>" npm run legacy:verify  -- --dump ./private/<backup>.backup.gz \
  --login-email <your own Code Compass email> --login-password '<your own password>'
```

All checks must pass, including the real sign-in with **your own** pre-existing account.

## 4. Vercel

1. **Inspect the existing project first.** In the project behind `code-compass-mu.vercel.app`: note the Git repo/branch, Framework Preset, Build Command, Output Directory, Root Directory and Domains. v2's `vercel.json` sets framework `vite`, build `npm run build`, output `dist`. Vercel keeps old deployments, so the current site stays one click away (Instant Rollback).
2. Settings → Environment Variables:

   | Variable | Production | Preview |
   |---|---|---|
   | `DATABASE_URL` | Neon **main** pooled URL | Neon **dev** pooled URL |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | a *different* value |
   | `APP_URL` | `https://code-compass-mu.vercel.app` (or your domain) | your preview URL or a stable preview alias |
   | `RESEND_API_KEY` | from Resend | same or a test key |
   | `EMAIL_FROM` | `Code Compass <hello@yourdomain>` | same |
   | `REQUIRE_EMAIL_VERIFICATION` | `false` until email works, then optionally `true` | `false` |

   Never set `NODE_ENV` — Vercel sets it.
3. Settings → Functions → Region: the same region as Neon. Node.js version: 22.x.
4. Push the `v2` branch → Vercel builds a **Preview** deployment against Neon `dev`.

## 5. Verify the preview

```bash
curl https://<preview-url>/api/health/live          # {"status":"ok",...}
curl https://<preview-url>/api/health               # db.ok: true, latencyMs
```

Then in a browser: sign in with your own migrated account; edit your profile; toggle a contact's visibility and check
it disappears for a second test account; create a team; request to join from the second account; accept; request a
password reset and confirm the email arrives; open DevTools → Console and confirm there are no CSP errors.

If `/api/*` returns the SPA's HTML instead of JSON, the rewrite isn't reaching the function — check that the
project's Root Directory is the repo root and that `api/index.ts` was detected under *Functions* in the deployment.

## 6. Cutover ⚠︎

1. Announce a short maintenance window (users will need to sign in again — sessions can't be carried over).
2. Take a **fresh** Supabase backup (anyone who signed up since the last one would otherwise be missed). Keep the original file untouched; work on a copy.
3. Import into production:
   ```bash
   npm run legacy:migrate -- --dump ./private/<fresh>.backup.gz --dry-run
   DATABASE_URL="<prod pooled url>" npm run legacy:migrate -- --dump ./private/<fresh>.backup.gz --confirm-host <prod host>
   DATABASE_URL="<prod pooled url>" npm run legacy:verify  -- --dump ./private/<fresh>.backup.gz --login-email … --login-password …
   ```
   The import is idempotent; re-running it only adds what's missing.
4. Take a Neon snapshot / note the timestamp (restore point).
5. Merge `v2` → `main`. Vercel deploys to Production. Re-run §5 against the production URL.
6. Leave the Supabase project **untouched** (not deleted) for at least 30 days as a fallback.

## 7. After launch

* **Close the old data leak.** The old app's anon key is public and its RLS lets anyone read every profile (including hidden WhatsApp numbers). After cutover, in Supabase: drop the `"Users can view all profiles"` policy (or pause the project). Do this as soon as v2 is live.
* **Custom domain:** add it in Vercel → Domains, then update `APP_URL` (and `EMAIL_FROM` domain) and redeploy.
* **Email:** verify your domain in Resend (DNS records). The shared `onboarding@resend.dev` sender is for testing only — verify a domain before relying on password reset.
* **Monitoring:** point an uptime monitor (e.g. UptimeRobot, Better Stack) at `/api/health/live` — **not** `/api/health`, which wakes the database every ping and burns Neon compute hours. Vercel → Logs shows API errors (each has a `requestId` that matches the error the user saw).
* **Backups:** see [DATABASE_BACKUP.md](DATABASE_BACKUP.md).

## Rollback

* **App:** Vercel → Deployments → previous production deployment → *Instant Rollback*. Rolling back to v1 makes the old Supabase app live again (its data is still there, but changes made in v2 since cutover won't be in it).
* **Data:** Neon → Branches → Restore to a point in time within the history window, or restore a `pg_dump` (DATABASE_BACKUP.md).

## Free-tier limits and costs (checked 10 Nov 2026 — re-check before relying on them)

| Service | Free allowance (as published) | When exceeded | Notes for Code Compass |
|---|---|---|---|
| **Neon Free** | 1 GB storage per project, 100 CU-hours per project per month, autoscaling up to 2 CU, scale to zero after 5 min (can't be disabled on Free), up to 6 h point-in-time history (≤1 GB), 5 GB public transfer per month, 1 manual snapshot | Compute suspended until the next billing period (or upgrade); over storage, writes fail. No data deleted, no surprise bill | Current data is a few MB. Scale-to-zero adds a cold start (usually well under a few seconds) to the first request after 5 idle minutes. Paid plans are usage-based (Launch ≈ $0.106/CU-hour, $0.35/GB-month) |
| **Vercel Hobby** | 1 M function invocations, 4 h active CPU, 360 GB-h provisioned memory, 100 GB fast data transfer per month; 300 s max duration | Features blocked until the 30-day window resets | **Hobby is for non-commercial personal use only.** If Code Compass starts making money or is run by a company, move to Pro ($20/user/month) |
| **Resend Free** | 100 emails/day, 3,000/month, 3 verified domains, 10 requests/s | Sending blocked (429) until reset | Plenty for password resets. Keep bounce rate < 4% |

Nothing here guarantees uptime: free tiers can change, and Neon/Vercel publish no SLA for free plans.
At student-community scale the expected monthly cost is **$0**; the first thing you'd pay for is a domain (~$10–15/year).

Sources: [Neon plans](https://neon.com/docs/introduction/plans), [Neon free-plan FAQ](https://neon.com/faqs/free-plan-limits-and-quotas),
[Vercel Hobby](https://vercel.com/docs/plans/hobby), [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
[Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing).
