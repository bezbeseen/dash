# Deployment package

This repo ships a **Docker** image (Next.js standalone + Prisma) and **Docker Compose** for a full stack with PostgreSQL.

## What you get

| Artifact | Purpose |
|----------|---------|
| `Dockerfile` | Production image: runs `prisma migrate deploy` on start, then `node server.js`. |
| `docker-compose.yml` | `postgres:16` + `app` on port **3000**. |
| `docker/entrypoint.sh` | Migration gate before the server starts. |
| `.dockerignore` | Keeps images smaller and avoids leaking `.env`. |

`next.config.ts` uses `output: 'standalone'` for a smaller Node bundle.

## Prerequisites

- Docker Engine + Docker Compose v2 (for Compose below).
- Environment variables: same names as `.env.example`. For Docker Compose you need at least:
  - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
  - `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` — URL users open (e.g. `https://dash.example.com`)
  - Plus DB and any integrations you use.

The **Invoice # → Import** button (Tickets and Pre-quoted pages) uses the same QuickBooks credentials as the rest of syncing; no extra env vars for that feature alone.

## Quick start (Compose)

From the repo root:

```bash
export NEXTAUTH_SECRET="$(openssl rand -base64 32)"
# If not using localhost:3000:
# export NEXTAUTH_URL="https://your-host"
# export NEXT_PUBLIC_APP_URL="https://your-host"

docker compose up -d --build
```

Open `http://localhost:3000` (or your published URL). The app container applies migrations on each start.

## Build the image only

```bash
docker build -t dash:latest .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dash" \
  -e DIRECT_URL="$DATABASE_URL" \
  -e NEXTAUTH_SECRET="…" \
  -e NEXTAUTH_URL="https://…" \
  -e NEXT_PUBLIC_APP_URL="https://…" \
  dash:latest
```

Use a managed Postgres (Neon, RDS, etc.) by pointing `DATABASE_URL` / `DIRECT_URL` at it instead of Compose `db`.

## CI / registry

Tag and push to your registry after `docker build`:

```bash
docker tag dash:latest your-registry/dash:v0.1.0
docker push your-registry/dash:v0.1.0
```

Run migrations once per deploy (the container runs `prisma migrate deploy` on startup; for multiple replicas, consider a single migration job before rolling out).

## QuickBooks Syncing (applies to both Docker and Vercel)

- **Sync from QuickBooks** button: pulls recent estimates + invoices.
- **Invoice # → Import** (new on Tickets and Pre-quoted pages): on-demand lookup by `DocNumber`. Useful when an invoice is created/paid before the next full sync.
- Webhooks (`/api/integrations/quickbooks/webhook`) are implemented but disabled by default. Register the endpoint in Intuit Developer when you want near-real-time updates.

## Vercel

If you deploy on **Vercel**, you do not need the Docker image: connect the project to the repo and set variables in **Project → Settings → Environment Variables**. Vercel does **not** read your laptop `.env` unless you use CLI sync—paste values for **Production** and **Preview** (if you use preview URLs).

### Env checklist

1. **`DATABASE_URL`** and **`DIRECT_URL`** — **Required.** Must point at **hosted** Postgres (Neon, Supabase, Vercel Postgres, etc.). **`localhost` fails**: the default **`npm run build`** runs **`prisma migrate deploy`**, which opens the DB during the build. Use the same URL for both unless your host documents separate pooler vs “direct” URLs.
2. **`NEXTAUTH_SECRET`** — Required. If missing, NextAuth returns **NO_SECRET** and `/api/auth/*` can 500. Generate: `openssl rand -base64 32`.
3. **`NEXTAUTH_URL`** and **`NEXT_PUBLIC_APP_URL`** — Set to the **exact origin** users open for that environment (no trailing slash), e.g. `https://your-project.vercel.app`. For **Preview** deployments, each `*.vercel.app` URL differs: use a **stable** domain you control, or accept that preview auth needs matching env per branch (see main README).
4. **Google** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; register every callback in Google Cloud (see main README). Optional: leave **`GOOGLE_REDIRECT_URI`** unset so the app builds the Gmail callback from the current host.
5. **QuickBooks** — client id/secret, environment, webhook verifier per `.env.example`. Optional: leave **`QUICKBOOKS_REDIRECT_URI`** unset unless you need a fixed URL; if set, path must be **`/api/integrations/quickbooks/callback`** (not Gmail).
6. **Redeploy** after changing secrets.

**Sanity check:** while logged in, open **`/api/integrations/env-check`** on the deployment (safe JSON: no secrets, includes DB host hints).

### Build

Use the default **`npm run build`**: **`prisma generate`**, **`prisma migrate deploy`** (applies migrations to the DB in `DATABASE_URL`), then **`next build`**.

To skip migrations in a custom pipeline, use **`npm run build:next`** and run **`npx prisma migrate deploy`** against the same database separately.

Ephemeral disk limits apply to Gmail attachment caching on serverless; see the main README.

## Prisma version

The image installs the Prisma CLI in the **runner** stage (`Dockerfile`) so `migrate deploy` can run. That version should stay aligned with **`package-lock.json`** (see the `node_modules/prisma` entry). After upgrading Prisma in the project, bump the `npm install prisma@…` line in the Dockerfile.

## Security notes

- Never commit `.env`. Compose reads from your shell or a local `.env` file Docker Compose auto-loads.
- Change the default Postgres password in `docker-compose.yml` before any internet-facing deploy.
- Terminate TLS at a reverse proxy or load balancer in production.
