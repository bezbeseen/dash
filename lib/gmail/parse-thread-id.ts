/** Strip invisible chars / junk from pasted browser text. */
export function sanitizeGmailPaste(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^\s+|\s+$/g, '')
    // Strip only surrounding quotes. Do NOT strip angle brackets from Message-ID values (<...@...>).
    .replace(/^["']+|["']+$/g, '');
}

/** Opaque Gmail web “sync” ids — not valid for threads.get / messages.get. */
export function isGmailWebSyncId(token: string): boolean {
  return /^(FMfcg|WhctK|Ktbx|CXKn|QgrcJ)/i.test(token.trim());
}

function decodeComponent(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, '%20'));
  } catch {
    return s;
  }
}

function looksLikeApiHexId(token: string): boolean {
  const t = token.trim();
  return /^[0-9a-f]{8,}$/i.test(t) && !isGmailWebSyncId(t);
}

function looksLikeBareApiToken(token: string): boolean {
  const t = token.trim();
  if (!t || isGmailWebSyncId(t) || t.includes('@') || t.includes(':') || t.includes('/')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(t) && t.length >= 8 && t.length <= 64;
}

/** `thread-f:DECIMAL` / `msg-f:DECIMAL` / `thread-a:r-DECIMAL` → hex id the Gmail API accepts. */
export function gmailWebFIdToHex(token: string): string | null {
  const decoded = decodeComponent(token.trim()).replace(/^#/, '');
  const m = decoded.match(/^(?:thread|msg)-[af]:(?:r-)?(-?\d+)$/i);
  if (!m?.[1]) return null;
  try {
    let n = BigInt(m[1]);
    if (n < 0n) n += 1n << 64n;
    const hex = n.toString(16);
    return hex.length % 2 === 1 ? `0${hex}` : hex;
  } catch {
    return null;
  }
}

function pushUnique(out: string[], id: string | null | undefined): void {
  if (!id) return;
  const t = id.trim();
  if (!t || isGmailWebSyncId(t) || t.includes('://') || t.includes('@')) return;
  if (!out.includes(t)) out.push(t);
}

function pushConvertedOrToken(out: string[], rawToken: string | null | undefined): void {
  if (!rawToken) return;
  const token = decodeComponent(rawToken.trim());
  if (!token || isGmailWebSyncId(token)) return;
  const converted = gmailWebFIdToHex(token);
  if (converted) {
    pushUnique(out, converted);
    return;
  }
  if (looksLikeApiHexId(token) || looksLikeBareApiToken(token)) {
    pushUnique(out, token);
  }
}

function queryParamsFromGmailPaste(s: string): URLSearchParams {
  const params = new URLSearchParams();
  const merge = (from: URLSearchParams) => {
    from.forEach((v, k) => {
      if (v && !params.has(k)) params.set(k, v);
    });
  };

  try {
    const u = new URL(s);
    merge(u.searchParams);
    const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) merge(new URLSearchParams(hash.slice(qIdx + 1)));
  } catch {
    const qIdx = s.indexOf('?');
    if (qIdx >= 0) {
      const rest = s.slice(qIdx + 1).split('#')[0] ?? '';
      merge(new URLSearchParams(rest));
    }
  }

  return params;
}

function hashPathFromGmailPaste(s: string): string {
  const hashIdx = s.lastIndexOf('#');
  if (hashIdx < 0) return '';
  let frag = s.slice(hashIdx + 1);
  frag = decodeComponent(frag);
  const qIdx = frag.indexOf('?');
  return qIdx >= 0 ? frag.slice(0, qIdx) : frag;
}

/**
 * Ids we can pass to Gmail `threads.get` / `messages.get`.
 * Skips FMfcgz… web tokens and never returns the raw URL.
 */
export function collectGmailApiIdCandidates(raw: string): string[] {
  const s = sanitizeGmailPaste(raw);
  if (!s) return [];
  const out: string[] = [];
  const params = queryParamsFromGmailPaste(s);

  pushConvertedOrToken(out, params.get('th'));
  pushConvertedOrToken(out, params.get('permthid'));
  pushConvertedOrToken(out, params.get('permmsgid'));
  pushConvertedOrToken(out, params.get('simpl'));

  const decoded = fullyUrlDecode(s);
  for (const m of decoded.matchAll(/[?&#](?:th|permthid)=([a-zA-Z0-9_-]+)/gi)) {
    pushConvertedOrToken(out, m[1]);
  }
  for (const m of decoded.matchAll(/[?&#](?:permmsgid|simpl)=([^&?#]+)/gi)) {
    pushConvertedOrToken(out, m[1]);
  }
  for (const m of decoded.matchAll(/\b((?:thread|msg)-[af]:(?:r-)?)(-?\d+)/gi)) {
    pushConvertedOrToken(out, `${m[1]}${m[2]}`);
  }

  const hashPath = hashPathFromGmailPaste(s);
  if (hashPath) {
    for (const part of hashPath.split('/').filter(Boolean)) {
      pushConvertedOrToken(out, part);
    }
  }

  if (!s.includes('://') && !s.includes('#')) {
    const msgid = s.match(/<([^\s<>]+@[^\s<>]+)>/);
    if (!msgid) pushConvertedOrToken(out, s);
  }

  return out;
}

/** Parse Gmail thread id from pasted URL or raw id. */
export function parseGmailThreadId(raw: string): string | null {
  const s = sanitizeGmailPaste(raw);
  if (!s) return null;

  const candidates = collectGmailApiIdCandidates(s);
  if (candidates[0]) return candidates[0]!;

  const msgIdBrackets = s.match(/<([^\s<>]+@[^\s<>]+)>/);
  if (msgIdBrackets?.[1]) return msgIdBrackets[1]!;

  return null;
}

/**
 * Turn whatever the user saved (full mail.google.com URL, `?th=…` link, or bare id) into the
 * id string we pass to Gmail `threads.get` / `messages.get`.
 */
export function resolveGmailThreadInputForApi(raw: string): string {
  return collectGmailApiIdCandidates(raw)[0] ?? '';
}

export function looksLikeGmailPaste(raw: string): boolean {
  const s = sanitizeGmailPaste(raw);
  if (!s) return false;
  if (collectGmailApiIdCandidates(s).length > 0) return true;
  if (extractRfc822MsgIdForSearch(s)) return true;
  if (/^https:\/\/mail\.google\.com\//i.test(s)) return true;
  if (isGmailWebSyncId(s) || /^(?:thread|msg)-f:/i.test(s)) return true;
  if (/^[a-zA-Z0-9_-]+$/.test(s) && s.length >= 8) return true;
  return false;
}

/** Browser Gmail account index from `/mail/u/0` — session order, not a stable mailbox map. */
export function extractGmailUrlUserIndex(raw: string): number | null {
  const m = sanitizeGmailPaste(raw).match(/mail\.google\.com\/mail\/u\/(\d+)/i);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** `authuser=` on a pasted Gmail URL when it is an email address. */
export function extractGmailAuthuserEmail(raw: string): string | null {
  const params = queryParamsFromGmailPaste(sanitizeGmailPaste(raw));
  const v = params.get('authuser')?.trim() ?? '';
  if (!v || !v.includes('@')) return null;
  return v.toLowerCase();
}

export type GmailMailboxRef = { id: string; googleEmail: string };

export function couldNotOpenGmailThreadMessage(triedEmails: string[]): string {
  const list = [...new Set(triedEmails.map((e) => e.trim()).filter(Boolean))];
  const where = list.length ? ` in ${list.join(', ')}` : ' in the connected mailboxes';
  return `Could not open that conversation${where}. Paste ⋮ Copy link from the account that has the mail.`;
}

/** One-line note when we still create a pre-quote ticket with the pasted URL saved. */
export function gmailBookmarkTicketExplanation(triedEmails: string[]): string {
  const list = [...new Set(triedEmails.map((e) => e.trim()).filter(Boolean))];
  const where = list.length ? ` (tried ${list.join(', ')})` : ' in the connected mailboxes';
  return `Could not open that conversation${where}, so QuickBooks is skipped until the mail can be read.`;
}

/**
 * Try the URL’s account hint first, then the form mailbox, then every other connection.
 * `/u/N` is only a weak index into `createdOrder` (oldest first) — Gmail’s index is per-browser.
 */
export function orderMailboxesForGmailPaste(
  mailboxes: GmailMailboxRef[],
  opts: { preferredId?: string; pasted: string; createdOrder?: GmailMailboxRef[] },
): GmailMailboxRef[] {
  const out: GmailMailboxRef[] = [];
  const used = new Set<string>();
  const push = (m: GmailMailboxRef | undefined) => {
    if (!m || used.has(m.id)) return;
    used.add(m.id);
    out.push(m);
  };

  const byEmail = new Map(mailboxes.map((m) => [m.googleEmail.trim().toLowerCase(), m]));
  const authuser = extractGmailAuthuserEmail(opts.pasted);
  if (authuser) push(byEmail.get(authuser));

  if (opts.preferredId) push(mailboxes.find((m) => m.id === opts.preferredId));

  const idx = extractGmailUrlUserIndex(opts.pasted);
  const created = opts.createdOrder ?? mailboxes;
  if (idx != null) push(created[idx]);

  for (const m of mailboxes) push(m);
  return out;
}

/** Iteratively URL-decode (Gmail often double-encodes #search/rfc822msgid…). */
function fullyUrlDecode(s: string): string {
  let out = s;
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(out.replace(/\+/g, '%20'));
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Extract RFC 822 Message-ID for Gmail search query `rfc822msgid:…` (works when web thread id ≠ API id).
 */
export function extractRfc822MsgIdForSearch(raw: string): string | null {
  const s = fullyUrlDecode(sanitizeGmailPaste(raw));
  const withBrackets = s.match(/<([^\s<>]+@[^\s<>]+)>/);
  if (withBrackets?.[1]) return withBrackets[1];

  // More resilient extraction when the pasted string contains hidden whitespace.
  // HTML form posts can sometimes turn `+` into spaces; try to normalize.
  const left = s.indexOf('<');
  const right = s.lastIndexOf('>');
  if (left >= 0 && right > left) {
    const between = s.slice(left + 1, right);
    const normalized = between.replace(/\s+/g, '+');
    if (normalized.includes('@')) return normalized;
  }

  // If user pasted without angle brackets, try to recover the value.
  // Gmail's Message-ID usually ends with @mail.gmail.com, but we'll keep this fairly generic.
  const bareCandidate = s.match(/([^\s<>]+@[^\s<>]+\.[A-Za-z0-9.-]+)/);
  if (bareCandidate?.[1]) {
    const val = bareCandidate[1]!;
    const leftPart = val.split('@')[0] ?? '';
    // Heuristic: Message-ID values usually contain characters like '+' or '=' on the left side.
    if (leftPart.length >= 8 && /[+=/]/.test(leftPart)) return val;
  }

  // #search/rfc822msgid%3Cxxx%40domain%3E → after decode often still has rfc822msgid prefix
  const rfc = s.match(/rfc822msgid[/:]*<?([\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.\w{2,})/i);
  if (rfc?.[1]) return rfc[1];

  return null;
}
