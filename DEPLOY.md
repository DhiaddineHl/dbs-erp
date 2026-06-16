# Deploying to Railway

## Why a fresh deploy looks "broken"

`.env` is git-ignored, so Railway starts with **no** environment variables. Without them:
the database isn't reachable, the tables were never created, and there's no user to log in with —
so every page errors or bounces to `/login`, and login fails.

This repo now **bootstraps itself on deploy**: the `start` script runs database migrations and an
idempotent seed before launching Next.js. You only need to provision Postgres and set 3 variables.

## One-time setup

### 1. Add a PostgreSQL database
In your Railway **project** → **New** → **Database** → **PostgreSQL**.

### 2. Set the app service variables
App service → **Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference the DB: `${{Postgres.DATABASE_URL}}` (uses the private network, no SSL needed) |
| `BETTER_AUTH_SECRET` | A random string ≥ 32 chars — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The app's **public HTTPS URL**, e.g. `https://your-app.up.railway.app` (no trailing slash) |

> Set these **before** deploying — they're needed at build and runtime.

### 3. Give the service a public domain
App service → **Settings** → **Networking** → **Generate Domain** (or add a custom domain).
Then make sure `BETTER_AUTH_URL` exactly matches that domain and **redeploy**. (Auth cookies and the
origin check depend on this — if it's wrong, sign-in silently fails.)

### 4. Deploy
Push to the connected branch (or **Deploy**). Railway will:
1. `npm install` + `npm run build`
2. on start: `node scripts/migrate.mjs` → applies `./drizzle/*.sql`
3. then the idempotent seed (default users, role permissions, reference + demo data)
4. then `next start`

Watch the deploy logs for `✓ Migrations up to date.` and the seed summary.

## Log in
Default accounts (created by the seed — **change the password immediately**):

- `admin@dbs.local` / `admin123` (admin)
- `resp@dbs.local` / `resp123`
- `dbs@dbs.local` / `dbs123`

## Notes
- **Migrations & seed run on every deploy/restart** and are idempotent (seed only inserts what's
  missing; migrations are tracked). The seed step is non-fatal so a hiccup won't block startup.
- Keep the service at **1 replica** (the seed's check-then-insert isn't concurrency-safe). For
  horizontal scaling, move migrate/seed to a Railway **pre-deploy command** instead of `start`.
- Run things manually if needed (locally these auto-load `.env`; under `railway run` they use the
  injected Railway env):
  - `npm run db:migrate` — apply migrations
  - `npm run db:seed` — (re)seed
  - `railway run npm run db:seed` — seed the Railway DB from your machine
- New schema changes: run `npm run db:generate` locally, commit the new `drizzle/*.sql`, and the
  next deploy applies them automatically.
