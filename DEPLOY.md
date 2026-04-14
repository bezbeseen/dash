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

### Vercel (quick checklist)

1. **`NEXTAUTH_SECRET`** — required. If missing, NextAuth throws **NO_SECRET** and `/api/auth/*` returns 500. Set for **Production** (and **Preview** if you test sign-in on preview URLs). Generate: `openssl rand -base64 32`.
2. **`NEXTAUTH_URL`** — production origin, e.g. `https://your-project.vercel.app` (no trailing slash). For preview deployments, NextAuth often still needs the **primary** production URL unless you use advanced cookie config.
3. Redeploy after adding or changing secrets.

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

## Vercel

If you deploy on **Vercel** instead, you do not need this Docker image: connect the Vercel project to the repo, set the same env vars in the dashboard, and use `npm run build` (which includes `prisma migrate deploy` in this project’s `build` script). Ephemeral disk limits apply to local Gmail attachment storage; see the main README.

## Prisma version

The image installs the Prisma CLI in the **runner** stage (`Dockerfile`) so `migrate deploy` can run. That version should stay aligned with **`package-lock.json`** (see the `node_modules/prisma` entry). After upgrading Prisma in the project, bump the `npm install prisma@…` line in the Dockerfile.

## Security notes

- Never commit `.env`. Compose reads from your shell or a local `.env` file Docker Compose auto-loads.
- Change the default Postgres password in `docker-compose.yml` before any internet-facing deploy.
- Terminate TLS at a reverse proxy or load balancer in production.
