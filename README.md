# Dash

Minimal QuickBooks-backed operations board for production workflow.

Repo: [github.com/bezbeseen/dash](https://github.com/bezbeseen/dash)

## What it does

- Creates local jobs from QuickBooks estimate/invoice sync events
- Derives board columns automatically from QuickBooks plus internal production actions
- Lets staff manually mark jobs as started, ready, or delivered
- Moves a job to Paid when the synced invoice is fully paid
- On each ticket: open **invoice/estimate PDFs** from QuickBooks and see **billing email** / customer message (full email threads aren’t in the QBO API)
- **Gmail (optional):** connect **up to 3** mailboxes (`gmail.readonly` — e.g. you, partner, contact@). On each ticket, pick **which mailbox** the thread lives in, save the **thread URL**, **Sync thread** → all messages + **attachments** under `storage/gmail-attachments/` (local disk; gitignored). **On Vercel**, serverless filesystem is ephemeral — treat Gmail attachment storage as best-effort unless you later plug in object storage (S3, etc.).

## Board logic

- **Lead** (`boardStatus` REQUESTED): pre-quote intake (unknown / draft / rejected estimate, or no real estimate yet). **Not shown on the dashboard** — noise stays out of the pipeline until you’ve sent a quote.
- **Quoted**: estimate status is **Sent** in QuickBooks (first column on the board). Use **Sync from QuickBooks** after changing estimate status so the board stays accurate.
- Approved: estimate accepted but work not started
- Production: work started
- **Ready / invoiced** (one column): either job marked **ready** for pickup/install, **or** a QuickBooks invoice exists (open) but shop flow hasn’t moved past that lane yet
- **Delivered / installed**: job delivered or installed on site (invoice may still be open)
- Paid: invoice paid in QuickBooks
- **Done** (action): archives the ticket in Dash only (no QuickBooks write). Browse archived **Done** tickets under sidebar **Done** (`/dashboard/done`). **Lost** is archived too but not listed on that page.

## Run locally

Dash uses **PostgreSQL** via Prisma (`DATABASE_URL`). For local Postgres you can use Docker, [Neon](https://neon.tech), Supabase, etc.

Example Docker Postgres:

```bash
docker run --name dash-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dash -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dash
```

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `DIRECT_URL` (and app URLs if not localhost). If Prisma errors about the URL protocol, your `.env` may still say `file:./…` from an older setup — replace it with PostgreSQL connection strings (see `.env.example` for Supabase pooler vs single-URL setups).
2. Install packages
3. Apply migrations
4. Seed demo data (optional)
5. Start Next.js

```bash
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

For day-to-day schema changes: `npx prisma migrate dev --name your_change`

### LAN discovery on Mac (Bonjour)

If other Macs on your network should discover/open this dev server more easily:

```bash
npm run dev:bonjour
```

Then try `http://<your-mac-hostname>.local:3000` from the other Mac.
If it still fails, allow incoming connections for Terminal/Node in macOS Firewall.

### Public HTTPS tunnel (works across networks)

If LAN access is flaky on office Wi-Fi, run:

```bash
npm run dev:tunnel
```

This prints a public URL plus exact OAuth callback URLs for QuickBooks and Gmail.
Keep that terminal open while testing.

## Connect QuickBooks (real API, local)

Skip the OAuth Playground redirect pain: use your app’s own callback.

1. In Intuit Developer → your app → **Settings → Redirect URIs** → **Development**, add **exactly**:

   `http://localhost:3000/api/integrations/quickbooks/callback`

   (Development allows HTTP.) Click **Save**.

2. Set in `.env`:

   - `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` (Development keys)
   - `QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback`
   - `QUICKBOOKS_ENVIRONMENT=sandbox` (until you use production API + tokens)

3. Run `npm run dev`, open `/dashboard`, click **Connect QuickBooks**, sign in to the **sandbox** company, approve. Tokens are stored in the database (`QuickBooksToken`).

4. After that, webhook sync calls use **real** `fetchEstimateById` / `fetchInvoiceById` against QuickBooks for that `realmId`.

5. On `/dashboard`, use **Sync from QuickBooks** to pull recent Estimates + Invoices. Invoices are listed by Id, then **fetched individually** so `Balance` and payment state match QuickBooks (the list query alone often omits balance, which used to leave paid invoices stuck in **Invoiced**).

If you still see old fake names (Acme Auto, etc.), those are from `npm run seed` or **Demo data only** — you can clear `Job` rows in Prisma Studio or ignore them.

## Connect Gmail (full thread + attachments on a ticket)

Uses Google’s **Gmail API** with readonly scope. You can connect **up to 3** Google accounts (sidebar **Connect Gmail** / **Add mailbox**). Reconnecting the same address refreshes tokens.

1. [Google Cloud Console](https://console.cloud.google.com/) → create or pick a project → **APIs & Services** → **Library** → search **Gmail API** → **Enable**. (If you skip this, OAuth can succeed but `users.getProfile` returns **403**.)
2. **OAuth consent screen** (External is fine for testing; add your Google account as a test user if in Testing).
3. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
4. **Authorized redirect URIs** (Google Cloud → your OAuth client → Web client): add **every** URL you will use, each on its own line — Google matches **exactly** (including `http` vs `https`, `localhost` vs `127.0.0.1`, no trailing slash):
   - `http://localhost:3000/api/integrations/gmail/callback`
   - `http://127.0.0.1:3000/api/integrations/gmail/callback` (if you ever open Dash via 127.0.0.1)
5. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. `GOOGLE_REDIRECT_URI` is **optional**: if omitted, Dash builds the redirect from the host you used when you clicked Connect (avoids localhost vs 127.0.0.1 token errors). If you set it, it must match one of the URIs in Google Cloud **and** how you open the app.
6. If you still see **token exchange failed**: confirm the client is type **Web application** (not Desktop), the Gmail API is enabled, and the client secret wasn’t regenerated after you copied it.

Then: sidebar **Connect Gmail** for each address you need (max 3) → open a ticket → choose **Mailbox** (where that thread appears in Gmail) → paste the **conversation URL** → **Save thread on ticket** → **Sync thread from Gmail**.

If Google returns **no refresh token**, revoke Dash’s access under the Google account’s **Security → Third-party access** and connect again (first consent must include `prompt=consent`, which the app requests).

**Which mailbox:** sync only sees threads the **selected** account can open in Gmail. If the wrong mailbox is chosen, sync may fail or show an empty thread.

## Dev-only: CSV preview (optional, isolated)

If you want **familiar-looking** tickets from a QuickBooks **Transaction List by Date** export without touching the main dashboard or sync routes:

- Open **`/dev/qbo-csv`** while running `npm run dev` (404 in production builds).
- Upload a CSV and click **Import**; jobs are created with synthetic IDs (`csv-est-…` / `csv-inv-…`) via `lib/dev/qbo-transaction-list-csv.ts`.
- **Or** from the project root: `npm run import-csv -- "Your Export.csv"` (same database as the app).
- **Then open `/dashboard`.** Putting a `.csv` in the repo does **not** auto-import; data lives in PostgreSQL (`DATABASE_URL`).
- This does **not** replace **Sync from QuickBooks**; it’s a separate code path for local UI experiments.

## Deploy on Vercel

1. Create a **managed PostgreSQL** database (Neon, Supabase, Vercel Postgres, etc.) and copy its connection string.
2. In the Vercel project → **Settings → Environment Variables**, set at least:
   - `DATABASE_URL` and **`DIRECT_URL`** — see `.env.example`. **Supabase:** the `db.*.supabase.co` direct URL is often **IPv6-only**; Vercel’s build can fail with **P1001**. Use the dashboard **Connect** strings: **Transaction pooler** → `DATABASE_URL` (port `6543`, add `?pgbouncer=true&sslmode=require`), **Session pooler** → `DIRECT_URL` (port `5432`). **Neon / others:** set both variables to the **same** URL.
   - `NEXT_PUBLIC_APP_URL` — your production site origin, e.g. `https://your-app.vercel.app`
   - QuickBooks: `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI` (must match an Intuit **Production** redirect URI using `https`), `QUICKBOOKS_ENVIRONMENT`, `QUICKBOOKS_WEBHOOK_VERIFIER` as needed
   - Gmail (if used): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; register `https://…/api/integrations/gmail/callback` in Google Cloud
3. Redeploy. The build runs `prisma generate`, **`prisma migrate deploy`** (applies migrations), then `next build`, so new databases get tables on first deploy.
4. If the site still errors: check **Vercel → Deployment → Logs** for Prisma/DB messages; confirm `DATABASE_URL` is set for **Production** (and Preview if you use preview deploys).

## Important files

- `prisma/schema.prisma` - core MVP schema
- `lib/domain/derive-board-status.ts` - self-moving board rules
- `lib/domain/sync.ts` - upsert and status update logic
- `app/api/integrations/quickbooks/webhook/route.ts` - webhook receiver
- `app/dashboard/page.tsx` - board UI
- `app/dashboard/done/page.tsx` - archive of tickets marked **Done** (sidebar **Done**)
- `app/dashboard/jobs/[id]/page.tsx` - ticket detail (composes `components/ticket-detail/*` sections)
- `components/ticket-detail/*` - modular ticket sections (money, production, QB ids, **invoice activity** timeline, PDFs, etc.)
- `lib/quickbooks/invoice-activity.ts` - builds payment/deposit timeline from Invoice + Payment + Deposit API reads (not identical to QBO UI)
- `app/api/jobs/[id]/invoice-pdf` / `estimate-pdf` - proxy QuickBooks PDF download
- `lib/gmail/sync-thread.ts` - pull Gmail thread messages + attachment files
- `app/api/integrations/gmail/connect` + `callback` - OAuth for Gmail readonly
- `lib/dev/` + `app/dev/qbo-csv` + `app/api/dev/qbo-transaction-list-csv` - optional local CSV preview (not core product)

## Next steps

- Verify webhook signature in production
- Tighten invoice-to-estimate linking from QuickBooks data as you scale
- Add job detail page and activity timeline
- Auth / multi-user when you leave single-shop local dev
