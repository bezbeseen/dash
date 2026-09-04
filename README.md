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
- **To-dos (optional):** shop-wide list on **To-dos** (assign a teammate, due date) — not ticket-based; ticket-related items stay under **Tasks**.
- **Gmail (optional):** connect **up to 3** mailboxes (`gmail.readonly` — e.g. you, partner, contact@). On each ticket, pick **which mailbox** the thread lives in, paste a Gmail conversation URL (or thread ID), **Save thread**, then **Sync thread** → all messages + **attachments**. Attachments are saved to `/tmp` on Vercel (ephemeral) or `./storage/gmail-attachments` locally. For production use, consider adding cloud storage (Vercel Blob, S3) later.

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

To **wipe only Pre-quote tickets** (`boardStatus` REQUESTED) and start fresh (local or any DB with `DATABASE_URL` set):

```bash
npm run clear-prequoted
```

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

**Marketing form → pre-quote** (`POST /api/webhooks/inbound-form-lead`): GoHighLevel (and similar) can POST JSON when a form is submitted. Set `INBOUND_FORM_WEBHOOK_SECRET` in `.env` / Vercel, then configure the workflow URL as **`https://<your-dash-domain>/api/webhooks/inbound-form-lead`** and add a header **`Authorization: Bearer <same secret>`** (or **`X-Dash-Webhook-Secret`**). New rows appear under **Pre-quote tickets** (`boardStatus` REQUESTED). Disable **Vercel Deployment Protection** for that path if webhooks return 401 HTML.

**Marketing conversation → pre-quote** (`POST /api/webhooks/inbound-conversation`): Same pattern for SMS/chat/conversation workflows. URL: **`https://<your-domain>/api/webhooks/inbound-conversation`**. Uses **`INBOUND_CONVERSATION_WEBHOOK_SECRET`** if set, otherwise the same secret as **`INBOUND_FORM_WEBHOOK_SECRET`**. Map message body fields in GHL custom data to keys like `message`, `body`, `transcript`, `summary`, plus contact merge fields as for forms.

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

## Web analytics

Two separate things, both optional:

**1. Tracking Dash itself** (who on your team uses which screens). Nothing to build — set env vars and redeploy:

- **Vercel Web Analytics / Speed Insights** — enable in **Vercel → Project → Analytics** (and **Speed Insights**). No env var; the component already ships in `app/layout.tsx`.
- **Google Analytics 4** — set **`NEXT_PUBLIC_GA_MEASUREMENT_ID`** to your `G-XXXXXXXX` (GA4 → Admin → Data streams → Web).
- **Microsoft Clarity** (heatmaps + session replay) — set **`NEXT_PUBLIC_CLARITY_PROJECT_ID`** (clarity.microsoft.com → Settings → Project ID).

Dash sits behind a login, so these measure **staff usage of the tool**, not customer traffic.

**2. Marketing-site traffic inside Dash** — sidebar **Web analytics** (`/dashboard/analytics`) reads GA4 server-side and shows users, sessions, page views, average session, bounce rate (each vs the previous period), plus top pages, channels, and devices over 7 / 28 / 90 days.

This uses a **service account**, so there is no OAuth consent screen and nothing to reconnect when tokens rotate:

1. Google Cloud → enable **Google Analytics Data API**. Any project works (quota is billed to whichever project owns the service account); it does **not** need to match the project behind `GOOGLE_CLIENT_ID`.
2. Create a **service account**, add a **JSON key**, and put the whole file in **`GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON`** (raw JSON or base64 of the file — base64 is easier to paste into Vercel).
3. GA4 → **Admin → Property access management** → add the service account email as **Viewer**.
4. Set **`GA4_PROPERTY_ID`** to the **numeric** property ID (GA4 → Admin → **Property settings**) — *not* the `G-XXXXXXXX` measurement ID.

`/api/integrations/env-check` reports `analytics.ga4Reporting` including the service account email to grant access to. The page shows setup steps until it is configured, and a targeted hint if Google returns `PERMISSION_DENIED` (means step 3 is missing).

**3. Microsoft Clarity behaviour signals** — the same page ends with a **Microsoft Clarity** section: sessions, distinct users, pages per session, bot sessions, scroll depth, active time, and the frustration signals GA4 has no equivalent for (dead clicks, rage clicks, excessive scrolling, quick backs, script errors, error clicks). It always links straight into Clarity for **heatmaps** and **session recordings**, which have no API.

To turn on the numbers:

1. Clarity → your project → **Settings → Data Export → Generate new API token**. Only **project admins** see this.
2. Name the token **4-32 characters**, letters/digits/`-`/`_`/`.` only, no spaces, unique within the project.
3. Copy the JWT (Clarity shows it once) into **`CLARITY_API_TOKEN`** and redeploy. Keep it server-side — never prefix it with `NEXT_PUBLIC_`.
4. Set **`NEXT_PUBLIC_CLARITY_PROJECT_ID`** as well so the Heatmaps / Recordings buttons open your project instead of the Clarity home page.

The [Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api) is heavily rationed: **10 requests per project per day** and **only the last 1-3 days** of data, no history and no time series. Dash therefore makes **one** request per refresh and caches the snapshot for **6 hours** (4 requests/day worst case), shows how old the snapshot is, and caches failures too so a bad token cannot burn the quota on every page view. Preview deployments share the same project quota. Exhausting it is its own UI state, not a generic error.

`/api/integrations/env-check` reports `analytics.clarityDataExport` (token set, project ID, quota, and the deep links), and hints when Clarity is recording but `CLARITY_API_TOKEN` is missing.

## Google Business Profile metrics

Sidebar **GBP metrics** (`/dashboard/gbp`) reads the [Business Profile Performance API](https://developers.google.com/my-business/reference/performance/rest) server-side using the OAuth connection from Settings, over **7 / 28 / 90** days with each number against the previous period: impressions (Search and Maps, desktop and mobile), calls, website clicks, direction requests, messages, bookings, plus the top search terms people used to find the listing.

**No new env vars.** The account and location are resolved from the stored connection (Account Management → Business Information), cached in the database for 30 minutes so repeated page views cannot trip Google's per-minute limits. If the profile has more than one location, buttons switch between them.

Ranges end **3 days before today**, because Google finalises daily performance numbers 48-72 hours late (direction requests sometimes later). Ending at today would make the newest window permanently short and every delta read falsely negative.

**Top search terms ignore the day selector.** `searchkeywords.impressions.monthly` aggregates by whole calendar month and the current month is never published, so Dash asks for complete months only — the last one for 7d and 28d, the last three for 90d — and labels which months it actually got. If the newest complete month has not been published yet the request steps back one further month rather than showing an empty table. Terms with very low counts come back as an upper bound instead of an exact number; those rows are kept and flagged, since dropping them would empty the table for a low-volume listing.

Percentage deltas are **suppressed below a prior-period count of 10** and replaced with the raw movement (`2 → 1`), uncoloured. At that scale a percentage reports sampling noise, not a trend. Rates and durations opt out of this, since they are not event counts.

Setup, all in the **same Google Cloud project as `GOOGLE_CLIENT_ID`**:

1. Enable **[Business Profile Performance API](https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com)**, and keep **My Business Account Management** and **Business Information** enabled — those resolve the location id.
2. Enabling is **not** enough. Check **[APIs & Services → Quotas](https://console.cloud.google.com/apis/api/businessprofileperformance.googleapis.com/quotas)**: **0** requests/minute means Google has not approved the project, **300** means it has.
3. If it is 0, submit the **[Business Profile API access form](https://support.google.com/business/contact/api_default)** → **Application for Basic API Access**, giving your Cloud **project number** from an email that is an owner/manager on the profile. A human reviews it, so expect a wait.
4. Sidebar **Settings → Connect Google Business Profile**. The OAuth scope Dash requests, **`https://www.googleapis.com/auth/business.manage`**, already covers performance reads — the same scope that lists accounts and locations.

The page has a distinct state for each failure instead of one generic error: not connected, token missing the `business.manage` scope (prompts a reconnect), API disabled, quota/rate limit, not an owner of the profile, no locations, and no activity in range. Search terms are published **per calendar month**, so that table covers the months the range touches and reports an upper bound rather than an exact count for rare terms.

`/api/integrations/env-check` reports `googleBusinessProfile.accessProbe`: granted scopes, whether `business.manage` is present, account and location counts, the resolved `locations/{id}`, and whether a live Performance API call succeeded — plus hints telling you to reconnect or to request quota.

## Yelp leads → pre-quote tickets

**"Request a Quote"** messages become pre-quote tickets (same lane as GHL leads). There are two paths, and **only the first is available to a normal advertiser**.

### 1. Yelp notification emails (self-serve, recommended)

Yelp's Leads API is *"limited to Yelp advertising and listing management reseller partners"* with a minimum spend, and Yelp points everyone else at a Zapier integration — but Zapier's webhook action is a premium app requiring the ~$20/month Professional plan. So Dash instead reads the **lead notification emails Yelp already sends you**, using the Gmail read-only scope it has.

1. Connect the mailbox that receives Yelp lead emails under **Settings → Gmail**.
2. Optionally set **`YELP_LEAD_EMAIL_MAILBOX`**. Leave it unset to use the review-request send-as mailbox, which itself falls back to `contact@beseensignshop.com` — so no environment variable is needed when Yelp mail arrives there.
3. In **Settings → "Yelp leads → pre-quote tickets"**, click **Preview matches** for a dry run, then **Import Yelp leads**.

`env-check → yelpLeadEmails` reports the address that will actually be scanned, **which setting chose it** (`YELP_LEAD_EMAIL_MAILBOX`, `REVIEW_REQUEST_SEND_AS_EMAIL`, or the built-in default), whether that address is Gmail-connected, and every connected mailbox — so an address mismatch is visible without opening the database. The Settings panel and both endpoints resolve through the same function, so a diagnostic can never disagree with what the scan does.

`GET /api/integrations/yelp/scan-emails` is the dry run: it reports every Yelp message it looked at, whether it counted as a lead (and if not, why), and exactly what it parsed — without writing anything. `POST` to the same path imports.

**Scan limits.** Both accept `?days=` (default 14, **capped at 180**) and `?max=` (**capped at 100**). The message default is adaptive: 50 for the routine 14-day window, and the full 100 whenever a longer window is asked for, because a backfill that stops early hides leads. The caps keep a run inside the serverless time budget. Every response echoes a `limits` block with the requested value, the value actually used and the cap, plus **`truncated`** and `truncationReason` — set whenever Gmail had more matching mail than the run read, so a capped scan is never mistaken for the complete history. Import a full year by running the scan repeatedly with `?days=180&max=100`; dedupe makes re-scanning safe.

**Counts.** Every message lands in exactly one bucket, reported under `counts`: `messagesExamined`, `leadEmailsFound`, `rejectedNotLeads`, `alreadyImported`, `newLeadsFound` (leads without a ticket — what a dry run would import), `ticketsCreated`, `fetchFailed`, `createFailed`. `messagesExamined` equals `leadEmailsFound + rejectedNotLeads + fetchFailed`. `counts.rejectedByReason` breaks the rejections down by category, and each candidate keeps its `outcome`, `rejectionCategory` and a human-readable `skipReason`.

**What counts as a lead.** Yelp routes four kinds of mail through the same `reply+<hex>@messaging.yelp.com` proxy, so the sender cannot separate them: a customer's Request a Quote, another shop replying to a quote *we* sent, our own shop's reply, and consumer marketing aimed at the account holder. `lib/yelp/lead-classify.ts` therefore classifies on the body. The positive signal is Yelp's `<Name> requested a quote from <shop> for a <job type>` sentence; the negatives are Braze campaign links or a `@mail.yelp.com` marketing sender (`consumer_marketing`), `replied to you` with the magic-link chrome (`reply_to_our_own_request`, or `own_business_reply` when the replying business is ours), and a request submitted under our own account (`own_account_request`). Anything with no positive signal and no negative falls back to the older lead wording, which keeps genuine customer follow-ups. Our own identity is derived, not hardcoded: the business name comes from the `INBOUND_SHOP_NAME_PATTERNS` config the pre-quote cards already use plus the scanned mailbox's domain root, and the account holder from that mailbox's local part. Set the optional **`YELP_OWN_ACCOUNT_NAMES`** when the owner's Yelp profile name does not resemble their email address, which is the only way to recognise their own test submissions.

**Links on a ticket are safe to click.** Yelp's lead emails only link to one-click action endpoints such as `/messaging/mark_as_replied_autosubmit/<conversation-id>`; opening one from a ticket, in a browser already signed in to biz.yelp.com, tells Yelp the shop replied — inflating the response rate Yelp ranks on and dropping a live lead out of "needs a reply". `lib/yelp/url.ts` refuses those URLs outright and strips every `utm_*` and `ytl_*` parameter from the ones it keeps. Since the business id needed for a `/messaging/<business-id>/thread/<conversation-id>` deep link is not in these emails, tickets get the plain **`https://biz.yelp.com/messaging`** inbox plus the conversation id; an older template that carries a real deep link keeps it. The Leads API path prefers Yelp's own `link_to_reply_in_yelp` and falls back to the documented thread URL.

Tickets dedupe on `Job.yelpLeadId`, preferring **Yelp's own conversation ID** — the 32-hex value that appears both in the `reply+<hex>@messaging.yelp.com` sender and in the `biz.yelp.com/messaging/...` link — and falling back to the Gmail thread ID only when neither is present. That keeps a follow-up on the same Yelp lead on one ticket even when Gmail files it under a different thread. Non-lead Yelp mail (ad reports, reviews, invoices, digests, sales calendar invites) is filtered out.

**The questionnaire is terminated structurally, not by recognising footer text.** Yelp's last question ("In what location do you need the service?") is followed by its stats card, so an answer collector that runs to end-of-body absorbs the whole footer — and content-based stripping only ever removes footer lines someone has already seen. Two structural rules end the block instead: an answer run ends at the first blank line once it has an answer (the questionnaire is contiguous), and Yelp's echo of the customer's name immediately before the stats card ends the questionnaire outright. The strip list is the second line of defence, not the fix.

A questionnaire can appear as more than one block — Yelp sometimes renders the free-text question under the heading, detached from the rest — so every block is collected and duplicate questions are merged. The line directly under an unanswered question is always taken as that answer even when it ends in `?`, because customers answer "any other details" with questions of their own ("do you make and install window clings?") and Yelp gives no marker to tell those from its own prompts.

The parser reads the job type from Yelp's `You have a new <type> request.` heading (falling back to `... requested a quote ... for a <type>.`), keeps the customer's last initial, structures the Request-a-Quote questionnaire into `Question → answer` pairs using the same formatter as the Leads API path, and surfaces the free-text answer and service ZIP at the top of the ticket. Yelp's preheader padding (soft hyphens and zero-width joiners), its untranslated ICU `{num_attachments, plural, ...}` placeholder, and its response-rate nagging are stripped.

Yelp reworks these email templates periodically. Every field is optional and the cleaned email body is always kept on the ticket, so a template change degrades detail rather than losing the lead. After editing the parser run **`npm run verify:yelp-email-parser`**, which asserts the URL-safety property against the full production fixture.

Two refinements are deliberately not built yet: routing on `utm_source=request_a_quote_first_message_v4` to tell a first contact from a follow-up (the `yelp:<conversation-id>` dedupe key already sends follow-ups to the existing ticket, so the extra signal buys little today), and seeding estimate line items from the job-specific survey questions.

### 2. Yelp Leads API webhooks (partner-gated)

Already implemented at **`POST /api/webhooks/yelp-leads`** for the day Yelp enables your app: it fetches the lead plus its message events and upserts a job keyed on `yelpLeadId`. It also only returns data for businesses **currently advertising** on Yelp, and does not support profiles using "Message the Business".

1. **`YELP_WEBHOOK_VERIFY_TOKEN`** — your own shared secret (`openssl rand -hex 32`).
2. **`YELP_LEADS_ACCESS_TOKEN`** — OAuth bearer with the **Leads** scope (*not* the Fusion API key; see [Yelp Leads API](https://docs.developer.yelp.com/docs/leads-api)).
3. Register **`https://<your-dash-domain>/api/webhooks/yelp-leads?token=<YELP_WEBHOOK_VERIFY_TOKEN>`** (also accepted as `Authorization: Bearer` or `X-Dash-Yelp-Secret`).

Opening that URL in a browser sends **GET** and returns a JSON hint — leads only arrive via Yelp's **POST**. Requests without the secret get `401`; a missing `YELP_LEADS_ACCESS_TOKEN` returns `503` so misconfiguration is obvious in Yelp's delivery log.

**Yelp Fusion** (`YELP_API_KEY`) is separate and unrelated to leads: public search and business details via `GET /api/integrations/yelp/search` and `GET /api/integrations/yelp/business/[id]`. It exposes no owner "insights" and currently has no screen in Dash.

## Dev-only: CSV preview (optional, isolated)

If you want **familiar-looking** tickets from a QuickBooks **Transaction List by Date** export without touching the main dashboard or sync routes:

- Open **`/dev/qbo-csv`** while running `npm run dev` (404 in production builds).
- Upload a CSV and click **Import**; jobs are created with synthetic IDs (`csv-est-…` / `csv-inv-…`) via `lib/dev/qbo-transaction-list-csv.ts`.
- **Or** from the project root: `npm run import-csv -- "Your Export.csv"` (same database as the app).
- **Then open `/dashboard`.** Putting a `.csv` in the repo does **not** auto-import; data lives in PostgreSQL (`DATABASE_URL`).
- This does **not** replace **Sync from QuickBooks**; it’s a separate code path for local UI experiments.

## Deploy on Vercel

The new **Invoice # → Import** feature and full QuickBooks syncing both work on Vercel (and locally). Longer checklist: **[DEPLOY.md](./DEPLOY.md)**.

1. Create a **managed PostgreSQL** database (e.g. [Neon](https://neon.tech)) and copy its connection strings.
2. In the Vercel project → **Settings → Environment Variables**, set at least:
   - **`DATABASE_URL`** and **`DIRECT_URL`** — Prisma reads **only** these names (see `prisma/schema.prisma`). They must point at **hosted** Postgres, **not** `localhost` (Vercel cannot reach your laptop). Most hosts use the **same** URL for both; Neon often gives a **pooler** URL for app traffic and a **direct / unpooled** URL for migrations — map them per Neon’s docs; add `?sslmode=require` when required.
   - **Neon via Vercel “Integrations”:** Vercel may inject many **`Dash_…`** variables (`Dash_DATABASE_URL`, etc.). Those do **not** replace `DATABASE_URL` / `DIRECT_URL` — copy the right Neon URLs into those two variables explicitly. Scope them for **Production** and **Preview** (or **All Environments**) so preview builds do not fall back to a wrong or missing URL.
   - **`NEXTAUTH_SECRET`**, **`NEXTAUTH_URL`**, **`NEXT_PUBLIC_APP_URL`** — use the **exact** `https://…` origin users open for that deployment (no trailing slash). Preview URLs change per deployment unless you attach a stable domain.
   - QuickBooks: `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`, `QUICKBOOKS_WEBHOOK_VERIFIER` as needed. **`QUICKBOOKS_REDIRECT_URI`** is optional; if set, path must be **`/api/integrations/quickbooks/callback`** (never paste the Gmail callback here).
   - Gmail (if used): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. **`GOOGLE_REDIRECT_URI`** is optional (omit so the app uses the current host + `/api/integrations/gmail/callback`).
3. **Google Cloud → OAuth Web client → Authorized redirect URIs:** add **every** URL you use, **exactly** (Google does not allow wildcards). At minimum include **`{origin}/api/auth/callback/google`** for NextAuth sign-in on each Vercel host (production, each preview slug you care about, plus localhost if you dev locally). Also add **`…/api/integrations/gmail/callback`** (and GBP if used) for those hosts. If you see **`redirect_uri_mismatch`**, copy the `redirect_uri=` value from the error into Google Cloud and save.
4. Redeploy. **`npm run build`** runs `scripts/assert-vercel-database-url.mjs` (fails fast if `DATABASE_URL` is missing or localhost on Vercel), then **`prisma generate`**, **`prisma migrate deploy`**, then **`next build`**. To build without migrations locally, use **`npm run build:next`**.
5. **Sanity check:** while logged in, open **`/api/integrations/env-check`** on the deployment — JSON only, no secrets; flags DB host, OAuth redirect hints, and common misconfigurations.
6. If the site still errors: **Vercel → Deployment → Logs** (build + runtime) for Prisma / NextAuth messages.

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
