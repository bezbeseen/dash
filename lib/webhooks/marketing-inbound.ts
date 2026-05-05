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

/** Contact block for ticket subtitle (email, phone, org, address). */
export function formatInboundContactBlock(fields: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const email = pickStr(fields, 'email', 'contact_email', 'Email');
  const phone = pickStr(fields, 'phone', 'phone_number', 'contact_phone', 'mobile');
  const org = pickStr(fields, 'organization', 'company', 'company_name');
  const a1 = pickStr(fields, 'address_1', 'address1', 'street', 'address');
  const city = pickStr(fields, 'city');
  const state = pickStr(fields, 'state');
  const zip = pickStr(fields, 'postal_code', 'zip', 'zip_code');
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (org) lines.push(`Org: ${org}`);
  const addr = [a1, city, state, zip].filter(Boolean).join(', ');
  if (addr) lines.push(`Address: ${addr}`);
  const text = lines.join('\n').trim();
  return text.length > 0 ? text.slice(0, 8000) : null;
}

/** Message / transcript block for conversation webhooks. */
export function formatConversationBody(fields: Record<string, unknown>): string | null {
  const channel = pickStr(fields, 'channel', 'channel_type', 'medium', 'message_type');
  const msg = pickStr(
    fields,
    'message',
    'last_message',
    'body',
    'transcript',
    'summary',
    'text',
    'content',
    'conversation_body',
    'lastMessageBody',
    'snippet',
    'incoming_message',
    'outbound_message',
  );
  const parts: string[] = [];
  if (channel) parts.push(`Channel: ${channel}`);
  if (msg) parts.push(msg.slice(0, 12000));
  const text = parts.join('\n\n').trim();
  return text.length > 0 ? text : null;
}

/** Every primitive field after normalize (helps when GHL uses unexpected key names). */
export function formatSubmittedFieldsLines(body: Record<string, unknown>): string | null {
  const lines: string[] = [];
  let total = 0;
  for (const key of Object.keys(body).sort()) {
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
