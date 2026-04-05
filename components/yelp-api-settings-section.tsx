import { getYelpApiKey } from '@/lib/yelp/fusion';

export function YelpApiSettingsSection() {
  const configured = Boolean(getYelpApiKey());

  return (
    <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
      <h2 className="h6 fw-semibold mb-2">Yelp Fusion API</h2>
      <p className="small text-body-secondary mb-3">
        Server-only key <code className="detail-mono">YELP_API_KEY</code> (create an app in{' '}
        <a href="https://www.yelp.com/developers" target="_blank" rel="noopener noreferrer">
          Yelp for Developers
        </a>
        ). Exposes read-only search and business details; not owner &quot;insights&quot; (separate / partner products).
      </p>
      <p className="small mb-2">
        Status:{' '}
        {configured ? (
          <span className="text-success fw-semibold">Key loaded</span>
        ) : (
          <span className="text-warning fw-semibold">Not configured</span>
        )}
      </p>
      <ul className="small text-body-secondary mb-0 ps-3">
        <li className="mb-1">
          <code className="detail-mono">GET /api/integrations/yelp/search?term=...&amp;location=...</code>
        </li>
        <li>
          <code className="detail-mono">GET /api/integrations/yelp/business/[yelpBusinessId]</code>
        </li>
      </ul>
    </section>
  );
}
