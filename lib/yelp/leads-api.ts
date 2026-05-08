const YELP_LEADS_BASE = 'https://api.yelp.com/v3';

function accessToken(): string {
  const t = process.env.YELP_LEADS_ACCESS_TOKEN?.trim();
  if (!t) {
    throw new Error('YELP_LEADS_ACCESS_TOKEN is not set');
  }
  return t;
}

/** GET /v3/leads/{id} — OAuth Bearer from Leads API (not Fusion API key). */
export async function yelpFetchLead(leadId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${YELP_LEADS_BASE}/leads/${encodeURIComponent(leadId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Yelp Get Lead ${res.status}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Yelp Get Lead: invalid JSON');
  }
}

/** GET /v3/leads/{id}/events — returns newest messages last (Yelp docs). */
export async function yelpFetchLeadEvents(leadId: string, limit = 30): Promise<unknown[]> {
  const url = `${YELP_LEADS_BASE}/leads/${encodeURIComponent(leadId)}/events?limit=${encodeURIComponent(String(limit))}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Yelp Get Lead Events ${res.status}: ${text.slice(0, 800)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Yelp Get Lead Events: invalid JSON');
  }
  if (Array.isArray(parsed)) return parsed;
  const o = parsed as Record<string, unknown>;
  const ev = o.events;
  return Array.isArray(ev) ? ev : [];
}
