# Database backup & restore

Code Compass stores everything — accounts, profiles, avatars, teams — in one Postgres database. There is no
other state to back up (no file storage, no Redis). Backups contain **personal data**: keep them encrypted, out of
git, and delete old ones.

## Layers of protection

| Layer | What it covers | Retention | Action needed |
|---|---|---|---|
| Neon point-in-time history | Any moment in the recent past (mistaken delete, bad migration) | Free plan: up to 6 h (≤1 GB of changes) | None — restore from the Neon console |
| Neon snapshot | One manual snapshot on Free | Until replaced | Take one before every migration or risky change |
| Logical dump (`pg_dump`) | Full, portable copy you control | You decide | Weekly (automated workflow below) + before migrations |
| Original Supabase backup | The v1 data as it was before migration | Forever | Store offline; never modify (verify with `sha256sum`) |

Free-plan history is short, so the weekly `pg_dump` is the real backup.

## Taking a backup manually

Use the **direct** (non-pooled) Neon connection string for dumps, and a `pg_dump` whose major version is ≥ the
server's (Code Compass's Neon project runs **Postgres 18**, so use `pg_dump` 18).

```bash
export BACKUP_URL="postgresql://…@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"   # direct host, no -pooler
pg_dump "$BACKUP_URL" --format=custom --no-owner --no-acl --file=codecompass-$(date +%F).dump
pg_restore --list codecompass-$(date +%F).dump | head          # sanity check
gpg --symmetric --cipher-algo AES256 codecompass-$(date +%F).dump && rm codecompass-$(date +%F).dump
```

`--no-owner --no-acl` keeps the dump portable to any provider.

## Automated weekly backup (GitHub Actions)

`.github/workflows/backup.yml` dumps the production database every Sunday, encrypts it with AES-256 and stores it as
a workflow artifact for 30 days. To enable it, add two repository secrets:

* `BACKUP_DATABASE_URL` — Neon **direct** connection string for the production branch
* `BACKUP_PASSPHRASE` — a long random passphrase; store it in your password manager (without it the backups are unreadable)

Run it once by hand (Actions → Database backup → *Run workflow*) and check that the artifact appears.
Make the repository private if it isn't — artifacts of public repositories can be downloaded by anyone with
repository read access (they're encrypted, but don't rely on that alone).

## Restoring

**Into a new Neon branch (safest — production keeps running):**
1. Neon console → create branch `restore-test` (empty or from any point).
2. Restore:
   ```bash
   gpg --decrypt codecompass-2026-11-15.dump.gpg > restore.dump
   pg_restore --no-owner --no-acl --exit-on-error --dbname "<restore-test direct url>" restore.dump
   ```
3. Check it:
   ```bash
   psql "<restore-test url>" -c "select (select count(*) from users) users, (select count(*) from profiles) profiles, (select count(*) from teams) teams;"
   DATABASE_URL="<restore-test url>" npm run db:migrate      # should say "up to date"
   ```
4. To switch production over, point Vercel's `DATABASE_URL` at the restored branch (or reset `main` from it in Neon) and redeploy.

**Point-in-time (Neon history):** Neon console → Branches → `main` → *Restore* → choose a timestamp within the
history window. Neon keeps a backup branch of the pre-restore state.

This procedure was tested locally on 10 Nov 2026: `pg_dump` (custom format) of the migrated database → restore into
an empty database → all 16 `legacy:verify` checks passed and `db:migrate` reported the schema up to date.

## Moving to another Postgres provider

Nothing in the app is Neon-specific beyond `DATABASE_URL`.

1. Create the new database (Postgres ≥ 15 with the `pg_trgm` extension available — standard on Supabase, RDS, Cloud SQL, Railway, Render, Crunchy, Aiven).
2. `pg_dump` from Neon as above, `pg_restore --no-owner --no-acl` into the new database.
3. Set `DATABASE_URL` in Vercel to the new connection string (use the provider's pooled endpoint if it has one; keep `sslmode=require`), redeploy, check `/api/health`.
4. Keep Neon read-only for a week, then delete it.

## The original Supabase backup

* File: `db_cluster-09-10-202606-12-32.backup.gz` (plain-text `pg_dumpall`, gzip).
  SHA-256: `fc20f7c1a3751471a731299adca7b0909db36ec4641eb597d5b366047d4908ce`.
* It includes Supabase internals and the auth audit log (IP addresses). Store it encrypted and offline; don't upload it to the repo, Vercel or Neon.
* To inspect it without restoring: `npm run legacy:migrate -- --dump <file> --dry-run`.
* For a fresh copy of the live v1 data without installing `pg_dump`: `SUPABASE_DB_URL=… npm run legacy:export -- --out private/fresh.backup.gz`
  (read-only, one consistent snapshot, output identical to `pg_dump` for the four tables the migration uses), then
  `npm run legacy:compare -- --old <original> --new private/fresh.backup.gz` to see what changed (counts, ids, dates only).
