# Dash Gmail add-on

Create ticket from an open Gmail conversation. Gmail gives Dash the real API thread id, so QuickBooks customer + $0 saved estimate is not skipped.

1. [script.google.com](https://script.google.com) → New project. Enable **appsscript.json** (Project Settings). Paste `appsscript.json` and `Code.gs`.
2. Project Settings → Script properties: `DASH_BASE_URL` (this Dash site’s https origin, no trailing slash) and `DASH_ADDON_SECRET` (same value as Vercel `GMAIL_ADDON_SECRET`).
3. **Deploy → Test deployments → Install.** Repeat while signed in as **bez@**, **contact@**, and **marc@** (each mailbox installs its own add-on).
4. Gmail → open a thread → sidebar **Dash** → **Create ticket**.
5. Optional: set `logoUrl` in `appsscript.json` to `{DASH_BASE_URL}/maxton/beseen-logo-face.png`.
