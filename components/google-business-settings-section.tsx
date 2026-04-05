import { prisma } from '@/lib/db/prisma';
import { getCachedGbpLocationList } from '@/lib/google-business/cached-location-list';

const MAX_GBP = 3;

export async function GoogleBusinessSettingsSection() {
  const connections = await prisma.googleBusinessConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    take: MAX_GBP,
  });
  const canAdd = connections.length < MAX_GBP;

  let apiPreview: { ok: true; accounts: number; locations: string[] } | { ok: false; message: string } | null = null;
  if (connections.length > 0) {
    try {
      const { accountCount, allLocations } = await getCachedGbpLocationList(connections[0].googleEmail);
      const locTitles = allLocations
        .map((l) => l.title)
        .filter(Boolean)
        .slice(0, 8);
      apiPreview = { ok: true, accounts: accountCount, locations: locTitles };
    } catch (e) {
      apiPreview = {
        ok: false,
        message: e instanceof Error ? e.message : 'Could not call Google Business Profile API.',
      };
    }
  }

  return (
    <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
      <h2 className="h6 fw-semibold mb-2">Google Business Profile (API)</h2>
      <p className="small text-body-secondary mb-3">
        OAuth with scope <code className="detail-mono">business.manage</code> to list accounts and locations (Account
        Management + Business Information APIs). Enable those APIs in the same Google Cloud project as your OAuth
        client. Optional: <code className="detail-mono">GOOGLE_REDIRECT_URI_GBP</code> if the default callback URL does
        not work for this host.
      </p>
      <p className="small text-body-secondary mb-3">
        In Google Cloud &rarr; Credentials, add redirect URI{' '}
        <code className="detail-mono" style={{ wordBreak: 'break-all' }}>
          https://YOUR_HOST/api/integrations/google-business/callback
        </code>{' '}
        (use your real host, e.g. localhost:3000 in dev).
      </p>

      <p className="menu-label mb-2">Connected ({connections.length}/{MAX_GBP})</p>
      {connections.length === 0 ? (
        <a className="btn btn-toolbar mb-3" href="/api/integrations/google-business/connect">
          Connect Google Business Profile
        </a>
      ) : (
        <>
          <ul className="list-unstyled small mb-3">
            {connections.map((c) => (
              <li key={c.id} className="mb-1">
                <span className="detail-mono">{c.googleEmail}</span>
              </li>
            ))}
          </ul>
          {canAdd ? (
            <a className="btn btn-toolbar btn-toolbar-muted mb-3" href="/api/integrations/google-business/connect">
              + Add Google account
            </a>
          ) : null}
        </>
      )}

      {apiPreview ? (
        <div className="border rounded-2 p-3 bg-body-secondary bg-opacity-25 small">
          <p className="fw-semibold mb-2">Live API preview (first connected account)</p>
          {apiPreview.ok ? (
            <>
              <p className="mb-1">Accounts: {apiPreview.accounts}</p>
              {apiPreview.locations.length > 0 ? (
                <ul className="mb-0 ps-3">
                  {apiPreview.locations.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-secondary mb-0">No locations returned for the first account (or none yet).</p>
              )}
            </>
          ) : (
            <p className="text-danger mb-0">{apiPreview.message}</p>
          )}
        </div>
      ) : null}

      <p className="small text-body-secondary mt-3 mb-0">
        Performance totals (impressions, calls, website clicks, directions) are on{' '}
        <a href="/dashboard/gbp" className="text-decoration-none fw-semibold">
          Dashboard &rarr; GBP metrics
        </a>
        . Enable{' '}
        <a
          href="https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none"
        >
          Business Profile Performance API
        </a>{' '}
        in Google Cloud if you see a 403.
      </p>
    </section>
  );
}
