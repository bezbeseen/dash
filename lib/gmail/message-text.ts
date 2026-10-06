import { gmail_v1 } from 'googleapis';

/** Gmail returns part bodies as base64url (RFC 4648 §5) rather than standard base64. */
export function decodeGmailBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
};

/** Gmail's `snippet` is HTML-escaped (`Esme&#39;s`). Single pass, so `&amp;lt;` stays `&lt;`. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const n = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const BLOCK_LEVEL_TAGS = /<(?:\/?(?:p|div|tr|table|ul|ol|h[1-6]|blockquote)|br\s*\/?|hr\s*\/?)>/gi;

/**
 * Good-enough HTML → text for notification emails: keeps line structure so that
 * label/value pairs ("Name: Jane") survive on their own lines for regex parsing.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep anchor targets: notification emails hide the thread link in href only.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const label = inner
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return label && !/^https?:/i.test(label) ? ` ${label} (${href}) ` : ` ${href} `;
    })
    .replace(BLOCK_LEVEL_TAGS, '\n')
    .replace(/<td[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 31 && n < 0x10ffff ? String.fromCodePoint(n) : ' ';
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectParts(
  part: gmail_v1.Schema$MessagePart | undefined | null,
  out: { mimeType: string; text: string }[],
): void {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  const data = part.body?.data;
  // Attachments carry a filename; their bodies are not message text.
  if (data && !part.filename && (mime === 'text/plain' || mime === 'text/html')) {
    out.push({ mimeType: mime, text: decodeGmailBase64(data) });
  }
  for (const p of part.parts || []) collectParts(p, out);
}

/**
 * Flattens a Gmail message into readable text, preferring text/plain and
 * falling back to a de-tagged text/html part.
 */
export function extractGmailMessageText(payload: gmail_v1.Schema$MessagePart | undefined | null): string {
  const parts: { mimeType: string; text: string }[] = [];
  collectParts(payload, parts);

  const plain = parts
    .filter((p) => p.mimeType === 'text/plain')
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
  if (plain) return plain.replace(/\r\n?/g, '\n');

  const html = parts
    .filter((p) => p.mimeType === 'text/html')
    .map((p) => p.text)
    .join('\n');
  return html ? htmlToPlainText(html) : '';
}

export function gmailHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined | null,
  name: string,
): string {
  const h = headers?.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h?.value?.trim() ?? '';
}
