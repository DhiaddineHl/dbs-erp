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

### 2b. Add object storage (photos and attachments)

Uploaded files — QC photos, commande photos — are **not** stored in Postgres. The `fichier` table
keeps only the index (SHA-256 hash, MIME type, size); the bytes live in an S3-compatible bucket.

In the Railway project → **New** → **Bucket**. Then copy its credentials onto the **app service**:

```bash
railway bucket credentials --bucket <bucket-name>
```

That prints exactly the six variables the app expects. Set them on the app service:

| Variable | Notes |
|---|---|
| `AWS_ENDPOINT_URL` | e.g. `https://t3.storageapi.dev` |
| `AWS_ACCESS_KEY_ID` | secret |
| `AWS_SECRET_ACCESS_KEY` | secret |
| `AWS_S3_BUCKET_NAME` | the real bucket name, with Railway's suffix |
| `AWS_DEFAULT_REGION` | `auto` is fine |
| `AWS_S3_URL_STYLE` | `virtual-host` (default), or `path` on providers that need it |

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are the SDK's own names. The other four are
Railway's, and the AWS SDK does **not** read them — `lib/services/stockage.ts` maps them onto the
client options explicitly, so any S3 provider works by changing only these values.

`AWS_S3_URL_STYLE` decides where the bucket name goes in the URL: `virtual-host` gives
`https://<bucket>.<endpoint>/<key>`, `path` gives `https://<endpoint>/<bucket>/<key>`. It maps to
the SDK's `forcePathStyle`. Virtual-host is AWS's default but needs wildcard DNS and a wildcard TLS
certificate for `*.endpoint`; servers that can't do that — MinIO by default, older Ceph, most local
setups — accept path-style only. Symptoms of the wrong choice are a DNS failure on the bucket
subdomain, or `SignatureDoesNotMatch`.
Verify the bucket answers before relying on it:

```bash
npm run verif:stockage          # locally, using .env
railway run npm run verif:stockage   # against the deployed service's variables
```

It writes one test object, reads it back, checks the bytes match, and deletes it.

> Without these variables the app still builds and every screen that doesn't touch a file works —
> uploads fail with an explicit message naming the missing variables, rather than silently.

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
