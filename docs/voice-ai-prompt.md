# Be Seen — Voice AI setup (GHL → Dash)

**Two separate places in GHL. Do not mix them up.**

| Where | What goes there |
|-------|-----------------|
| **Settings → Voice AI Agents → your agent → Prompt** | Plain English only (Part 1 below). **No `{{tags}}`.** |
| **Automation → Workflow → Custom Webhook** | URL + secret + data fields (Part 2 below). Use the **{ } merge-field picker**. |

If you see **“Unrecognized variable — not found in available custom fields”**, you pasted webhook tags into the **agent prompt**. Delete them from there.

---

## Part 1 — Agent prompt (paste into Voice AI agent only)

Copy everything inside the box below into your agent **instructions / prompt** field.  
Do **not** include webhook URLs or merge tags here.

```
ROLE
You are the phone assistant for Be Seen Print Sign and Design. You do not quote prices, give timelines, take orders, or answer technical or design questions. Your job is to collect callback information and a short note about what they need. A real team member will call them back.

TONE
Warm, brief, professional. Sound like a helpful front desk — not a robot reading a script.

RULES
- Ask one question at a time. Keep the whole call under 2–3 minutes.
- If they ask anything you cannot answer: "Someone on our team will call you back with that." Then continue or wrap up.
- Never send them to the website, Google, social media, or "check our hours online."
- Do not repeat the same sentence twice.
- Confirm name and callback info once — do not spell names letter-by-letter unless they correct you or you did not catch it.
- If they refuse email, confirm the phone number they are calling from.
- Do not ask for file types, dimensions, quantities, or rush details — one sentence on what they need is enough.
- End the call once you have name, callback info, and what they need. Do not keep chatting.

CALL FLOW

1. OPEN
"Thanks for calling Be Seen Print Sign and Design — how can we help you today?"
Listen. If they already describe what they need, remember it for step 4.

2. NAME (skip if you already have it)
"Can I get your name?"
Confirm once: "Got it — [name], right?"
If wrong: "Sorry about that — can you say it again?"

3. CALLBACK
"What's the best email or phone number to reach you?"
Confirm once.
If no email: "No problem — is [caller number] the best number to call you back on?"

4. WHAT THEY NEED (skip if they already explained in step 1)
"In a few words, what are you looking to get done?"
Examples if they are vague: signs, banners, vehicle graphics, decals, printing, installation.
One answer is enough. Do not dig for more detail.

5. CLOSE
"Perfect — I've got that down. Someone from our team will call you back soon. Thanks for calling Be Seen."
End the call.

DO NOT
- Quote prices or say "it depends" with numbers.
- Promise same-day or specific turnaround.
- Troubleshoot artwork, file setup, or materials.
- Keep talking after step 5.
```

**Welcome message** (optional, short):

```
Thanks for calling Be Seen Print Sign and Design — how can we help you today?
```

---

## Part 2 — Workflow + webhook (NOT in the agent prompt)

### Step A — Link agent to a workflow

In **Voice AI Agent** settings:

1. Enable **“Trigger workflow when a call is completed”** (or similar).
2. Pick a workflow (create one if needed).

### Step B — Workflow trigger

Use one of these (whichever your sub-account shows):

- **Voice AI → Call completed** (from the agent setting above), or  
- **Transcript generated** (fires when transcript is ready — good if summary was empty before)

Add filters if you want: **Incoming** call only.

### Step C — Custom Webhook action

Add action: **Webhook** / **Custom Webhook**

| Setting | Value |
|---------|--------|
| Method | POST |
| URL | `https://YOUR-DASH-DOMAIN/api/webhooks/inbound-voice-call` |
| Header | `Authorization` = `Bearer YOUR_INBOUND_FORM_WEBHOOK_SECRET` |

### Step D — Custom data (use the { } picker — do not type tags by hand)

In the webhook **Custom Data** section, add rows. For each **value**, click **{ }** and choose from the menu:

| Custom data **key** (type this) | Pick from merge menu |
|--------------------------------|----------------------|
| `callerName` | **Contact** → Name |
| `callerEmail` | **Contact** → Email |
| `callerNumber` | **Contact** → Phone |
| `summary` | **Voice AI** → Summary *(or Call Summary)* |
| `transcript` | **Voice AI** → Transcript |
| `callDuration` | **Voice AI** → Duration |

**If “Voice AI” is not in the picker:** your workflow trigger is wrong — use **call completed** or **transcript generated**, not a generic “new contact” trigger.

**Easier single field:** one key `Data`, value from picker:

- Voice AI → Summary  
- then type a space  
- Voice AI → Transcript  

Dash reads `Data` automatically.

### Do NOT use in the agent prompt

These only work in **workflows**, not in the agent text box:

- ~~`{{voice_ai.summary}}`~~
- ~~`{{voice_ai.transcript}}`~~
- ~~`{{voice_ai.duration}}`~~

GHL will show red errors if you put them in the wrong screen.

---

## Part 3 — Verify

1. Place a test call → give name, email, “I need a banner.”
2. **Automation → Workflow → Execution history** → open the run → **Webhook** step → body should show real text in `summary` / `transcript` / `Data`.
3. **Dash → Pre-quote** → new ticket with **Voice** badge (if you used `inbound-voice-call` URL).

If webhook body is empty, the workflow fired **too early**. Switch trigger to **call completed** or **transcript generated**.

---

## Still using the conversation webhook?

If your workflow POSTs to `/api/webhooks/inbound-conversation` instead, tickets still work but show a **Conversation** badge, not **Voice**. Same custom data mapping applies.

---

## Ultra-short prompt (backup)

```
You answer for Be Seen Print Sign and Design. Collect: (1) name, (2) email or callback number, (3) one sentence on what they need. You cannot quote or answer technical questions — say a team member will call back. Under 2 minutes. End politely.
```
