# Dash

Minimal QuickBooks-backed operations board for production workflow.

Repo: [github.com/bezbeseen/dash](https://github.com/bezbeseen/dash)

## What it does

- Creates local jobs from QuickBooks estimate/invoice sync events
- **New:** "Invoice # → Import" on Tickets and Pre-quoted pages (instant lookup by DocNumber when full sync hasn't seen the invoice yet)
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

Dash uses **PostgreSQL** via Prisma (`DATABASE_URL`). For local Postgres you can use Docker, [Neon](https://neon.tech), Vercel Postgres, etc.

Example Docker Postgres:

```bash
docker run --name dash-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dash -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dash
```

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `DIRECT_URL` (and app URLs if not localhost). If Prisma errors about the URL protocol, your `.env` may still say `file:./…` from an older setup — replace it with PostgreSQL connection strings (see `.env.example`; usually both variables are the same URL).
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

### Local environment vs deploy

Use a **local profile** so you can change behavior before anything hits Vercel:

1. **`.env`** (gitignored) — copy from `.env.example`, fill in **PostgreSQL** (`DATABASE_URL`, `DIRECT_URL`), `NEXTAUTH_SECRET`, and integration keys. This is your day-to-day machine config. Run `npm run dev` with **`http://localhost:3000`** so URLs stay consistent.
2. **`.env.local`** (gitignored) — optional. Copy from `env.local.example` if you want a second layer (e.g. only override `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` without editing `.env`). Next.js merges `.env.local` over `.env`. **Leave `DATABASE_URL` / `DIRECT_URL` in `.env`** (or duplicate them there); Prisma CLI reads `.env` by default, not `.env.local`.
3. **Production** — set the same variable names in **Vercel → Project → Settings → Environment Variables** (production URL, production DB if applicable, Intuit **Production** redirect URIs, etc.). Deploy when you are ready; the app does not read your laptop’s `.env` on Vercel.

You get a full local app (DB, UI, Google sign-in, Slack, etc.) on your machine; **QuickBooks OAuth** often needs a public `https` callback registered at Intuit, so many teams test the **Connect QuickBooks** flow against a **preview/production** URL, or use a tunnel URL, while still developing everything else locally. See **Connect QuickBooks** below.

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

## QuickBooks Syncing

### Two ways to get invoices/estimates into Dash

1. **"Sync from QuickBooks" button** (on Tickets and Pre-quoted pages)
   - Pulls the ~100 most recently updated Estimates + Invoices from QBO.
   - Good for bulk updates after you make changes in QuickBooks.

2. **"Invoice # → Import"** (new)
   - Small input box next to the Sync button on both **Tickets** and **Pre-quoted** pages.
   - Type an invoice number (or `DocNumber`), click **Import**.
   - Immediately looks up that specific invoice in QuickBooks and creates/updates the job (even if the full sync hasn't seen it yet).
   - Perfect for the case where "an invoice is created and paid before a QB sync happens".

Both paths use the same backend logic (`upsertJobFromInvoice` in `lib/domain/sync.ts`).

**Webhooks** (`/api/integrations/quickbooks/webhook`) are implemented and ready but **disabled by default**. They provide near-real-time updates when something changes in QBO. Setup requires registering the webhook URL in the Intuit Developer portal.

---

## Connect QuickBooks (real API, local)

Skip the OAuth Playground redirect pain: use your app’s own callback.

1. In Intuit Developer → your app → **Settings → Redirect URIs**, register a callback that matches how you run the app (Intuit matches **scheme + host + path** exactly):

   - **Development** tab often allows **`http://localhost:3000/api/integrations/quickbooks/callback`**. If the portal rejects it or you only use **Production** redirect URIs (HTTPS-only), use one of these instead:
   - **HTTPS on localhost:** run `npm run dev:https`, then add **`https://localhost:3000/api/integrations/quickbooks/callback`**. The browser will warn about the dev certificate once — continue to localhost.
   - **HTTPS tunnel (recommended if Production keys + HTTPS required):** run `npm run dev:tunnel`, wait for the printed **`https://…`** URL, then add **`https://<that-host>/api/integrations/quickbooks/callback`** to Intuit. **Open Dash using that same `https://…` URL** in the browser (not plain `localhost`) so OAuth `redirect_uri` matches.

   Click **Save** in Intuit after each change.

2. Set in `.env`:

   - `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` (Development keys)
   - `QUICKBOOKS_ENVIRONMENT=sandbox` (until you use production API + tokens)
   - `QUICKBOOKS_REDIRECT_URI` is **optional**: if omitted, Dash uses **whatever host you opened** + `/api/integrations/quickbooks/callback` (so `http://localhost:3000/...` when you run locally). Set it only if you need a fixed URL (e.g. behind a proxy). **Remove** a production-only redirect from local `.env` if OAuth was sending you to the live site.

3. Run `npm run dev` (or `npm run dev:https` / `npm run dev:tunnel` to match the redirect you registered), open `/dashboard`, click **Connect QuickBooks**, sign in to the **sandbox** company, approve. Tokens are stored in the database (`QuickBooksToken`).

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

The new **Invoice # → Import** feature and full QuickBooks syncing both work on Vercel (and locally).

1. Create a **managed PostgreSQL** database (Neon, Vercel Postgres, RDS, etc.) and copy its connection string.
2. In the Vercel project → **Settings → Environment Variables**, set at least:
   - `DATABASE_URL` and **`DIRECT_URL`** — see `.env.example`. Most hosts use the **same** URL for both. If your provider gives separate pooler vs “direct” migration URLs, map them accordingly; add `?sslmode=require` when the host requires TLS.
   - `NEXT_PUBLIC_APP_URL` — your production site origin, e.g. `https://your-app.vercel.app`
   - QuickBooks: `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`, `QUICKBOOKS_WEBHOOK_VERIFIER` as needed. `QUICKBOOKS_REDIRECT_URI` is optional (defaults to the deployment origin + callback path); if set, it must match an Intuit **Production** redirect URI using `https`.
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
