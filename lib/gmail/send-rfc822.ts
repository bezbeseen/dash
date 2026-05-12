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

/**
 * Minimal HTML email (UTF-8). Headers must stay mostly ASCII; subject may contain any Unicode.
 */
export function buildHtmlRfc822Message(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const subj = rfc2047SubjectUtf8(params.subject);
  const lines = [
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
