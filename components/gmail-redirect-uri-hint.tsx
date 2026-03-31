import { headers } from 'next/headers';
import { GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';

/**
 * Shows the redirect URI Google Cloud must allow (based on how you opened Dash).
 * "This page doesn't exist" is usually this path typo'd in Google Cloud.
 */
export async function GmailRedirectUriHint() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = (h.get('x-forwarded-proto') ?? 'http').split(',')[0]!.trim();
  const uri = `${proto}://${host}${GMAIL_OAUTH_CALLBACK_PATH}`;

  return (
    <div className="gmail-oauth-callback-hint meta" style={{ marginTop: 10, fontSize: 11, lineHeight: 1.4 }}>
      <strong>Google Cloud redirect URI</strong> (copy exactly — includes{' '}
      <code className="detail-mono">/api/integrations/</code>):
      <code
        className="detail-mono"
        style={{ display: 'block', marginTop: 6, wordBreak: 'break-all', fontSize: 10 }}
      >
        {uri}
      </code>
    </div>
  );
}
