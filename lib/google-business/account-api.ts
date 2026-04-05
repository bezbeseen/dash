export type GbpAccount = { name: string; accountName?: string };

export async function listGbpAccounts(accessToken: string): Promise<{ accounts?: GbpAccount[] }> {
  const res = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=50',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GBP accounts.list ${res.status}: ${t.slice(0, 800)}`);
  }
  return res.json() as Promise<{ accounts?: GbpAccount[] }>;
}

export type GbpLocation = { name?: string; title?: string; websiteUri?: string };

export async function listGbpLocations(
  accessToken: string,
  accountResourceName: string,
): Promise<{ locations?: GbpLocation[] }> {
  const parent = encodeURIComponent(accountResourceName);
  const mask = encodeURIComponent('name,title,websiteUri');
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${parent}/locations?pageSize=20&readMask=${mask}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GBP locations.list ${res.status}: ${t.slice(0, 800)}`);
  }
  return res.json() as Promise<{ locations?: GbpLocation[] }>;
}
