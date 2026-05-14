import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

/** Gmail API `raw` uses URL-safe base64 without padding. */
export function encodeRfc822ForGmailRaw(rfc822: string): string {
  return Buffer.from(rfc822, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function rfc2047SubjectUtf8(subject: string): string {
  const buf = Buffer.from(subject, 'utf-8');
  return `=?UTF-8?B?${buf.toString('base64')}?=`;
}

export type Rfc822Attachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

function base64BodyForMime(buf: Buffer): string {
  const b64 = buf.toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join('\r\n');
}

function buildMultipartAlternativeRfc822(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): string[] {
  const subj = rfc2047SubjectUtf8(params.subject);
  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${subj}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="dash-boundary-1"',
    '',
    '--dash-boundary-1',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.text.replace(/\r?\n/g, '\r\n'),
    '',
    '--dash-boundary-1',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.html.replace(/\r?\n/g, '\r\n'),
    '',
    '--dash-boundary-1--',
    '',
  ];
}

/**
 * HTML + plain UTF-8 email. Optional **attachments** wrap the usual `multipart/alternative` in
 * `multipart/mixed` (RFC 2046) so Gmail can send PDFs alongside the body.
 */
export function buildHtmlRfc822Message(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Rfc822Attachment[];
}): string {
  const attachments = params.attachments?.filter((a) => a.content.length > 0) ?? [];
  if (attachments.length === 0) {
    return buildMultipartAlternativeRfc822(params).join('\r\n');
  }

  const subj = rfc2047SubjectUtf8(params.subject);
  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${subj}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="dash-mixed-1"',
    '',
    '--dash-mixed-1',
    'Content-Type: multipart/alternative; boundary="dash-boundary-1"',
    'Content-Transfer-Encoding: 7bit',
    '',
    '--dash-boundary-1',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.text.replace(/\r?\n/g, '\r\n'),
    '',
    '--dash-boundary-1',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.html.replace(/\r?\n/g, '\r\n'),
    '',
    '--dash-boundary-1--',
    '',
  ];

  for (const att of attachments) {
    const safeName = att.filename.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'attachment.bin';
    lines.push(
      '--dash-mixed-1',
      `Content-Type: ${att.contentType}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64BodyForMime(att.content),
      '',
    );
  }
  lines.push('--dash-mixed-1--', '');
  return lines.join('\r\n');
}

export async function gmailSendRfc822(oauth2: OAuth2Client, rfc822: string): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const raw = encodeRfc822ForGmailRaw(rfc822);
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}
