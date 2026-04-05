/** Server-only Yelp Fusion API (v3). Key must not be exposed to the browser. */

export function getYelpApiKey(): string | null {
  const k = process.env.YELP_API_KEY?.trim();
  return k || null;
}

export function requireYelpApiKey(): string {
  const k = getYelpApiKey();
  if (!k) {
    throw new Error('YELP_API_KEY is not set in environment');
  }
  return k;
}

export async function yelpBusinessSearch(term: string, location?: string) {
  const key = requireYelpApiKey();
  const params = new URLSearchParams({ term, limit: '15' });
  if (location?.trim()) params.set('location', location.trim());
  const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: { description?: string } }).error?.description === 'string'
        ? (data as { error: { description: string } }).error.description
        : `Yelp ${res.status}`;
    throw new Error(msg);
  }
  return data as {
    businesses?: Array<{
      id: string;
      name: string;
      url?: string;
      rating?: number;
      review_count?: number;
    }>;
  };
}

export async function yelpBusinessById(id: string) {
  const key = requireYelpApiKey();
  const res = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: { description?: string } }).error?.description === 'string'
        ? (data as { error: { description: string } }).error.description
        : `Yelp ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
