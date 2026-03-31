# `lib/dev` — experimental / local-only helpers

Code here is **not** part of the core QuickBooks ↔ dashboard flow. It exists so you can try things (e.g. CSV preview imports) without touching the main sync paths.

- **`qbo-transaction-list-csv.ts`** — parses a QBO “Transaction List by Date” CSV and upserts `Job` rows via the same `upsertJobFromEstimate` / `upsertJobFromInvoice` helpers as the API (IDs are prefixed with `csv-est-` / `csv-inv-` so they won’t collide with real QBO IDs).

Entry point in the app: **`/dev/qbo-csv`** (disabled in production builds).
