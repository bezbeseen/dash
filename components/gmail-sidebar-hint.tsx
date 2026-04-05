import { prisma } from '@/lib/db/prisma';
import { GmailConnectAnchor } from '@/components/gmail-connect-link';

const MAX_MAILBOXES = 3;

/** List connected Gmail accounts (up to 3) + link to add another. */
export async function GmailSidebarHint() {
  const connections = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    take: MAX_MAILBOXES,
  });
  const canAdd = connections.length < MAX_MAILBOXES;

  return (
    <div className="gmail-sidebar-hint">
      <p className="menu-label" style={{ marginTop: 8 }}>
        Gmail ({connections.length}/{MAX_MAILBOXES})
      </p>
      {connections.length === 0 ? (
        <GmailConnectAnchor className="btn btn-toolbar gmail-sidebar-btn">Connect Gmail</GmailConnectAnchor>
      ) : (
        <>
          <ul className="gmail-sidebar-list">
            {connections.map((c) => (
              <li key={c.id} className="gmail-sidebar-list-item">
                <span className="detail-mono" title={c.googleEmail}>
                  {c.googleEmail}
                </span>
              </li>
            ))}
          </ul>
          {canAdd ? (
            <GmailConnectAnchor className="btn btn-toolbar gmail-sidebar-btn">+ Add mailbox</GmailConnectAnchor>
          ) : (
            <p className="meta" style={{ margin: '8px 0 0', fontSize: 11 }}>
              All {MAX_MAILBOXES} slots used.
            </p>
          )}
        </>
      )}
    </div>
  );
}
