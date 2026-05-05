# Notes: inbound marketing, GHL, Neon, and Vercel (session recap)

Operational notes from wiring **Go High Level → Dash** (`/api/webhooks/inbound-conversation`), fixing **Neon/Prisma** on deploy, and hardening parsers. Useful when something “worked yesterday” but not today.

---

## Neon + Vercel / Prisma

- **`DATABASE_URL`**: Neon **pooled** URL (host usually contains `-pooler`). Used for normal app queries.
- **`DIRECT_URL`**: Neon **direct** URL (same DB/user/password; host **without** `-pooler`). Required for reliable `prisma migrate deploy`; pooler-only breaks advisory locks (P1002) or auth if mis-set.
- After **password rotation**, update **both** strings on Vercel (and local `.env`). Updating only one causes **P1000** / blank dashboard.

**Build script behavior (see `scripts/`):**

- Asserts sensible DB env on Vercel; warns or fails on obvious pooler/config mistakes.
- On Vercel, migrate may use **advisory lock disabled** for deploy (mitigation for P1002); see script comments and `PRISMA_MIGRATE_STRICT_ADVISORY_LOCK` if you need strict locking.

---

## GHL webhook → Dash (`inbound-conversation`)

### Auth

- **`Authorization: Bearer <secret>`** or **`X-Dash-Webhook-Secret: <secret>`**.
- **`INBOUND_CONVERSATION_WEBHOOK_SECRET`** if set; else **`INBOUND_FORM_WEBHOOK_SECRET`**.
- Middleware allows this route without a logged-in user.

### Browser vs POST

- Opening the webhook URL in a browser sends **GET** → JSON hint to use POST + Bearer. **Leads only come from GHL POST**, not from visiting the URL.

### Two workflows burned us

- **“New Lead Call Trigger”** (early “new lead” style) often fired when **`{{voice_ai.*}}`** was still **empty**.
- **“New Workflow : AI Call task”** — **Call Details** after inbound call (**filters**: Incoming + number) matches when Voice AI merge fields commonly **fill**.
- **Recommendation**: **One** workflow should POST to Dash; remove or disable webhook on duplicates to avoid confusing empty payloads.

### GHL payload reality (their doc)

- Default JSON includes **`contact`**, **`location`**, **`workflow`**, sometimes **`message: { type, … }`** with **no `body`** — that metadata is **not** the transcript.
- **`voice_ai.transcript` / summary / duration** come from **merge tags you put in Custom Data** — they are empty until GHL has that context for **that execution**.

### Custom Data patterns that work with Dash

- **Single field**: key **`Data`**, value e.g. `{{voice_ai.transcript}} {{voice_ai.summary}} {{voice_ai.duration}}` (we map `Data` / `data`).
- **Or** separate keys: `message`, `trans`, `convo`, `transcript`, etc. (see `lib/webhooks/marketing-inbound.ts`).
- **`customData`** may arrive as spaces-only (`"  "`) → nothing to display until tags resolve — fix trigger/timing in GHL first; confirm in **Execution log → Webhook → resolved body**.

### Normalization quirks we fixed (code)

- Re-merge **non-empty strings** from `customData` / `formData` after assigning raw payload (avoid overwriting with empties).
- **Flatten** nested objects and **overwrite empty** slots when inner values carry the real transcript.
- Don’t shallow-merge **`message`** as a nested envelope in the first pass when GHL sends `{ "type": 1 }`; **hoist** real text subfields or strip pure metadata envelopes.
- **`voice_ai`** / **`activity`** / **`conversations_ai`** merged early where useful; many transcript key aliases (`calltranscription`, `convo`, **`1`** for row mapped to transcript, etc.).

### Recording + CRM lines on tickets

- **Recording**: HTTPS URLs under common keys (`recording_url`, `media_url`, …) → line **`Recording: …`** (Twilio URLs often need auth to download).
- **CRM / “all in one”**:
  - Custom Data URL keys: `all_in_one_url`, `crm_url`, `contact_url`, … → **`CRM: …`**
  - Or env **`GHL_CONTACT_URL_TEMPLATE`** with `{locationId}` and `{contactId}` built from payload `location.id` + `contact_id` (see `.env.example`).

---

## Debugging checklist (order)

1. Vercel deploy is current `main` and env vars (DB + webhook secrets + optional `GHL_CONTACT_URL_TEMPLATE`) match.
2. **One** GHL workflow owns the Dash webhook; trigger is **after call** with **filters** you intend.
3. Execution log → **Webhook** step → **`Data` / `message` / transcript fields** are **non-empty** (if empty, Dash is correct to show nothing).
4. Dash ticket → **Activity → Raw payload** for the exact JSON stored.

---

## Files touched (high level)

- `lib/webhooks/marketing-inbound.ts` — parsing, transcript/recording/CRM blocks, normalization.
- `app/api/webhooks/inbound-conversation/route.ts` (and related routes) — POST handling.
- `scripts/prisma-migrate-deploy-retry.mjs`, `scripts/assert-vercel-database-url.mjs` — deploy/DB guardrails.
- `.env.example` — `GHL_CONTACT_URL_TEMPLATE` and related notes.

This file is **session notes**, not a full product spec; when behavior changes, update code + `.env.example` / `README` as needed.
