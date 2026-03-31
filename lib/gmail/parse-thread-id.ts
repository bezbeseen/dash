/** Strip invisible chars / junk from pasted browser text. */
export function sanitizeGmailPaste(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^\s+|\s+$/g, '')
    // Strip only surrounding quotes. Do NOT strip angle brackets from Message-ID values (<...@...>).
    .replace(/^["']+|["']+$/g, '');
}

/** Parse Gmail thread id from pasted URL or raw id. */
export function parseGmailThreadId(raw: string): string | null {
  const s = sanitizeGmailPaste(raw);
  if (!s) return null;

  const tokenOk = (t: string) => /^[a-zA-Z0-9_-]+$/.test(t) && t.length >= 8;

  // If the user pasted a "Message-ID: <...@...>" header line, extract the value inside <...>.
  const msgIdBrackets = s.match(/<([^\s<>]+@[^\s<>]+)>/);
  if (msgIdBrackets?.[1]) return msgIdBrackets[1]!;

  // Gmail "print" / share links often use ?th=THREAD_ID or &th=THREAD_ID
  const thParam = s.match(/[?&]th=([a-zA-Z0-9_-]+)/);
  if (thParam && tokenOk(thParam[1]!)) return thParam[1]!;

  if (!s.includes('://') && !s.includes('#')) {
    return tokenOk(s) ? s : null;
  }

  try {
    const u = new URL(s);
    const th = u.searchParams.get('th');
    if (th && tokenOk(th)) return th;

    // Gmail "open message" URLs often include `permmsgid=msg-f%3A...`
    // That value is a Gmail *message id*; we can use it to fetch the message,
    // then read its `threadId`.
    const perm = u.searchParams.get('permmsgid');
    if (perm) {
      try {
        return decodeURIComponent(perm);
      } catch {
        return perm;
      }
    }
  } catch {
    /* not a full URL */
  }

  const takeLastSegment = (frag: string): string | null => {
    const path = frag.split('?')[0] ?? frag;
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1]!;
    return tokenOk(last) ? last : null;
  };

  const hashIdx = s.lastIndexOf('#');
  if (hashIdx >= 0) {
    let frag = s.slice(hashIdx + 1);
    try {
      frag = decodeURIComponent(frag);
    } catch {
      /* keep raw */
    }
    const id = takeLastSegment(frag);
    if (id) return id;
  }

  try {
    const u = new URL(s);
    let frag = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
    try {
      frag = decodeURIComponent(frag);
    } catch {
      /* keep */
    }
    const id = takeLastSegment(frag);
    if (id) return id;
  } catch {
    /* not a URL */
  }

  return null;
}

/**
 * Turn whatever the user saved (full mail.google.com URL, `?th=…` link, or bare id) into the
 * id string we pass to Gmail `threads.get` / `messages.get`.
 */
export function resolveGmailThreadInputForApi(raw: string): string {
  const s = sanitizeGmailPaste(raw);
  if (!s) return '';
  const direct = parseGmailThreadId(s);
  if (direct) return direct;
  try {
    const decoded = parseGmailThreadId(decodeURIComponent(s));
    if (decoded) return decoded;
  } catch {
    /* ignore */
  }
  return s;
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
    const left = val.split('@')[0] ?? '';
    // Heuristic: Message-ID values usually contain characters like '+' or '=' on the left side.
    if (left.length >= 8 && /[+=\/]/.test(left)) return val;
  }

  // #search/rfc822msgid%3Cxxx%40domain%3E → after decode often still has rfc822msgid prefix
  const rfc = s.match(/rfc822msgid[/:]*<?([\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.\w{2,})/i);
  if (rfc?.[1]) return rfc[1];

  return null;
}
