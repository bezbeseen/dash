import { NextRequest } from 'next/server';
import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';

export function webhookAuthorized(req: NextRequest, secret: string): boolean {
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = req.headers.get('x-dash-webhook-secret')?.trim() ?? '';
  return bearer === secret || header === secret;
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/** Merge nested CRM / GHL shapes into one flat object for field lookup. */
const NESTED_PAYLOAD_KEYS = [
  'contact',
  'formData',
  'form',
  'data',
  'payload',
  'customData',
  'body',
  'conversation',
  'conversationData',
  'message',
  'lastMessage',
  'submission',
  'meta',
  'properties',
  'attribution',
] as const;

function expandJsonStringsInValues(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t.length < 2 || (!t.startsWith('{') && !t.startsWith('['))) continue;
    try {
      const parsed: unknown = JSON.parse(t);
      const r = asRecord(parsed);
      if (r) out[k] = r;
    } catch {
      /* keep string */
    }
  }
  return out;
}

function flattenNestedObjects(input: Record<string, unknown>, rounds = 3): Record<string, unknown> {
  let cur = { ...input };
  for (let round = 0; round < rounds; round++) {
    const next: Record<string, unknown> = { ...cur };
    for (const [k, v] of Object.entries(cur)) {
      const r = asRecord(v);
      if (!r) continue;
      for (const [k2, v2] of Object.entries(r)) {
        const composite = `${k}_${k2}`;
        if (next[composite] === undefined) next[composite] = v2;
        if (
          next[k2] === undefined &&
          (typeof v2 === 'string' || typeof v2 === 'number' || typeof v2 === 'boolean')
        ) {
          next[k2] = v2;
        }
      }
    }
    cur = next;
  }
  return cur;
}

export function normalizeInboundPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of NESTED_PAYLOAD_KEYS) {
    const r = asRecord(raw[key]);
    if (r) Object.assign(merged, r);
  }
  Object.assign(merged, raw);
  let cur = expandJsonStringsInValues(merged);
  cur = flattenNestedObjects(cur);
  cur = expandJsonStringsInValues(cur);
  cur = flattenNestedObjects(cur);
  return cur;
}

export function pickStr(root: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = root[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Normalize keys for CRM payloads ("Contact Email", "contact-email" → "contact_email"). */
function normalizeInboundKey(key: string): string {
  return key.toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Like pickStr, but also matches keys case-insensitively / with space vs underscore (GHL, etc.).
 */
export function pickInboundString(fields: Record<string, unknown>, ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const v = fields[c];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  const wanted = new Set(candidates.map(normalizeInboundKey));
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    if (wanted.has(normalizeInboundKey(k))) return v.trim();
  }
  return undefined;
}

const INBOUND_EMAIL_KEY_CANDIDATES = [
  'email',
  'Email',
  'contact_email',
  'contactEmail',
  'Contact Email',
  'Contact_Email',
  'primary_email',
  'primaryEmail',
  'email_address',
  'emailAddress',
  'e_mail',
  'mail',
  'user_email',
  'lead_email',
  'from_email',
  'contact_email_address',
] as const;

const EMAIL_IN_STRING = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function inferEmailFromInboundFieldValues(fields: Record<string, unknown>): string | undefined {
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    if (!normalizeInboundKey(k).includes('email')) continue;
    const m = v.match(EMAIL_IN_STRING);
    if (m) return m[0];
  }
  for (const v of Object.values(fields)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const m = v.match(EMAIL_IN_STRING);
    if (m) return m[0];
  }
  return undefined;
}

/** Best-effort email for inbound webhooks (seed link, contact block, customer fallback). */
export function resolveInboundLeadEmail(fields: Record<string, unknown>): string | undefined {
  const direct = pickInboundString(fields, ...(INBOUND_EMAIL_KEY_CANDIDATES as unknown as string[]));
  if (direct) return direct;
  return inferEmailFromInboundFieldValues(fields);
}

/** Contact block for ticket subtitle (email, phone, org, address). */
export function formatInboundContactBlock(fields: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const email = resolveInboundLeadEmail(fields);
  const phone = pickInboundString(
    fields,
    'phone',
    'phone_number',
    'contact_phone',
    'mobile',
    'cell',
    'telephone',
    'primary_phone',
    'PrimaryPhone',
    'contact_phone_number',
    'Contact Phone',
  );
  const org = pickInboundString(
    fields,
    'organization',
    'company',
    'company_name',
    'Company',
    'companyName',
    'business_name',
    'Business Name',
  );
  const a1 = pickInboundString(fields, 'address_1', 'address1', 'street', 'address', 'Street Address');
  const city = pickInboundString(fields, 'city', 'City');
  const state = pickInboundString(fields, 'state', 'State', 'province');
  const zip = pickInboundString(fields, 'postal_code', 'zip', 'zip_code', 'postalCode', 'Postal Code');
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (org) lines.push(`Org: ${org}`);
  const addr = [a1, city, state, zip].filter(Boolean).join(', ');
  if (addr) lines.push(`Address: ${addr}`);
  const text = lines.join('\n').trim();
  return text.length > 0 ? text.slice(0, 8000) : null;
}

/** Long-form transcript / recording text (often separate from last SMS in CRM). */
const TRANSCRIPT_FIELD_CANDIDATES = [
  'transcript',
  'Transcript',
  'conversation_transcript',
  'Conversation Transcript',
  'call_transcript',
  'Call Transcript',
  'calltranscription',
  'callTranscription',
  'Call Transcription',
  'activity_calltranscription',
  'full_transcript',
  'Full Transcript',
  'transcription',
  'Transcription',
  'transcript_text',
  'Transcript Text',
  'recording_transcript',
  'Recording Transcript',
  'ai_transcript',
  'voice_transcript',
  'voicemail_transcription',
  'Voicemail Transcription',
  'conversation_summary',
  'Conversation Summary',
  'call_summary',
  'Call Summary',
  'ai_summary',
  'convo',
  'Convo',
];

/** Last message / short body (SMS, chat bubble) — overlaps transcript keys omitted here on purpose. */
const MESSAGE_FIELD_CANDIDATES = [
  'message',
  'Message',
  'convo',
  'Convo',
  'last_message',
  'lastMessage',
  'Last Message',
  'body',
  'Body',
  'summary',
  'Summary',
  'text',
  'Text',
  'content',
  'Content',
  'conversation_body',
  'conversationBody',
  'lastMessageBody',
  'last_message_body',
  'snippet',
  'Snippet',
  'incoming_message',
  'outbound_message',
  'sms_body',
  'smsBody',
  'chat_message',
  'full_message',
  'Full Message',
  'message_body',
  'Message Body',
];

/** Message / transcript block for conversation webhooks. */
export function formatConversationBody(fields: Record<string, unknown>): string | null {
  const channel = pickInboundString(
    fields,
    'channel',
    'channel_type',
    'Channel',
    'medium',
    'message_type',
    'Message Type',
    'conversation_type',
  );
  const transcript = pickInboundString(fields, ...(TRANSCRIPT_FIELD_CANDIDATES as unknown as string[]));
  const msg = pickInboundString(fields, ...(MESSAGE_FIELD_CANDIDATES as unknown as string[]));

  const bodyParts: string[] = [];
  if (channel) bodyParts.push(`Channel: ${channel}`);

  const t = transcript?.trim() ?? '';
  const m = msg?.trim() ?? '';
  if (t && m) {
    if (t.includes(m) || m.includes(t)) {
      bodyParts.push((t.length >= m.length ? t : m).slice(0, 12000));
    } else {
      bodyParts.push(`${m.slice(0, 6000)}\n\n---\n\n${t.slice(0, 12000)}`);
    }
  } else if (t) {
    bodyParts.push(t.slice(0, 12000));
  } else if (m) {
    bodyParts.push(m.slice(0, 12000));
  }

  const text = bodyParts.join('\n\n').trim();
  return text.length > 0 ? text : null;
}

/** Keys that are almost always CRM/workflow noise in GHL-style payloads (not shown in ticket text). */
function isInboundSubmittedFieldNoise(key: string): boolean {
  const k = key.toLowerCase().replace(/\s+/g, '_');
  if (k === 'id') return true;
  if (k === 'address' || k === 'street' || k === 'street_address' || k === 'streetaddress') return true;
  if (k === 'city') return true;
  if (k === 'medium') return true;
  if (k === 'country') return true;
  if (k === 'state' || k === 'postalcode' || k === 'postal_code' || k === 'zip' || k === 'zip_code') {
    return true;
  }
  if (k.includes('attribution')) return true;
  if (k.includes('sessionsource') || k.includes('session_source')) return true;
  if (/^full_?address$/i.test(k) || k === 'fulladdress') return true;
  if (k.endsWith('_id')) return true;
  if (k.startsWith('workflow')) return true;
  if (k.startsWith('execution')) return true;
  if (k.startsWith('trigger')) return true;
  if (k.startsWith('location_')) return true;
  if (k.startsWith('contact_') && !['contact_email', 'contact_phone', 'contact_name'].includes(k)) return true;
  if (
    /^date(_created|_updated|_added|_modified|created|updated|added|modified)/i.test(k) ||
    k === 'datetime' ||
    k === 'timestamp'
  ) {
    return true;
  }
  if (k === 'tags' || k === 'meta' || k === 'source' || k === 'type' || k === 'version') return true;
  if (k === 'approved_accounts' || k === 'approvedaccounts') return true;
  return false;
}

/** Every primitive field after normalize (helps when GHL uses unexpected key names). */
export function formatSubmittedFieldsLines(body: Record<string, unknown>): string | null {
  const lines: string[] = [];
  let total = 0;
  for (const key of Object.keys(body).sort()) {
    if (isInboundSubmittedFieldNoise(key)) continue;
    const v = body[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    const s = typeof v === 'string' ? v.trim() : String(v);
    if (!s) continue;
    const line = `${key}: ${s}`;
    total += line.length + 1;
    if (total > 6500) break;
    lines.push(line);
  }
  return lines.length ? lines.join('\n') : null;
}

export function buildInboundTicketDescription(
  projectName: string,
  body: Record<string, unknown>,
  opts: { includeConversation: boolean },
): string | null {
  const contact = formatInboundContactBlock(body);
  const conv = opts.includeConversation ? formatConversationBody(body) : null;
  const submitted = formatSubmittedFieldsLines(body);
  const summaryParts = [contact, conv, submitted ? `Submitted fields:\n${submitted}` : null].filter(Boolean);
  const merged = summaryParts.join('\n\n---\n\n').trim();
  return sanitizeJobProjectDescription(projectName, merged.length > 0 ? merged : null);
}

export async function readInboundBody(
  req: NextRequest,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const o: Record<string, unknown> = {};
      params.forEach((v, k) => {
        o[k] = v;
      });
      return { ok: true, data: o };
    }
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const o: Record<string, unknown> = {};
      for (const [k, v] of form.entries()) {
        o[k] = typeof v === 'string' ? v : v instanceof File ? v.name : String(v);
      }
      return { ok: true, data: o };
    }
    const text = await req.text();
    if (!text.trim()) return { ok: true, data: {} };
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'json_not_object' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'parse_failed' };
  }
}

/** Prefer dedicated conversation secret; fall back to form secret so one Vercel var can secure both. */
export function inboundMarketingWebhookSecret(which: 'form' | 'conversation'): string | null {
  if (which === 'conversation') {
    const dedicated = process.env.INBOUND_CONVERSATION_WEBHOOK_SECRET?.trim();
    if (dedicated) return dedicated;
  }
  return process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim() ?? null;
}

/** Voice / AI call summaries (e.g. email body from Zapier). Falls back to form secret. */
export function inboundVoiceCallWebhookSecret(): string | null {
  const dedicated = process.env.INBOUND_VOICE_CALL_WEBHOOK_SECRET?.trim();
  if (dedicated) return dedicated;
  return process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim() ?? null;
}
