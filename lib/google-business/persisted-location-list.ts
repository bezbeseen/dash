import { prisma } from '@/lib/db/prisma';
import { listGbpAccounts, listGbpLocations } from '@/lib/google-business/account-api';
import { getValidGoogleBusinessAccessToken } from '@/lib/google-business/tokens';

export type CachedGbpLocation = { name: string; title: string };

type SnapshotPayload = {
  accountCount: number;
  locations: CachedGbpLocation[];
};

const FRESH_MS = 30 * 60 * 1000;
/** Use stored snapshot on API failure if younger than this (avoid ancient data). */
const STALE_FALLBACK_MAX_MS = 14 * 24 * 60 * 60 * 1000;

function parseSnapshot(json: unknown): SnapshotPayload | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const accountCount = typeof o.accountCount === 'number' ? o.accountCount : null;
  const locations = o.locations;
  if (accountCount == null || !Array.isArray(locations)) return null;
  const list: CachedGbpLocation[] = [];
  for (const item of locations) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name : '';
    const title = typeof r.title === 'string' ? r.title : name;
    if (name) list.push({ name, title: title.trim() || name });
  }
  return { accountCount, locations: list };
}

async function pullFromGoogleApi(googleEmail: string): Promise<SnapshotPayload> {
  const token = await getValidGoogleBusinessAccessToken(googleEmail);
  const { accounts } = await listGbpAccounts(token);
  const firstAccount = accounts?.[0];
  if (!firstAccount?.name) {
    return { accountCount: accounts?.length ?? 0, locations: [] };
  }
  const locRes = await listGbpLocations(token, firstAccount.name);
  const raw = locRes.locations ?? [];
  const locations: CachedGbpLocation[] = raw
    .filter((l) => l.name)
    .map((l) => ({
      name: l.name as string,
      title: (l.title || l.name || 'Location').trim(),
    }));
  return { accountCount: accounts?.length ?? 0, locations };
}

/**
 * Lists GBP locations with DB caching to avoid Account Management 429s. Uses a fresh in-DB snapshot
 * for 30m without calling Google; on API failure returns last snapshot when recent enough.
 */
export async function fetchGbpLocationsResilient(googleEmail: string): Promise<{
  accountCount: number;
  allLocations: CachedGbpLocation[];
  source: 'db_fresh' | 'api' | 'db_stale';
}> {
  const row = await prisma.googleBusinessConnection.findUnique({
    where: { googleEmail },
    select: { gbpLocationsSnapshot: true, gbpLocationsSnapshotAt: true },
  });

  const ageMs = row?.gbpLocationsSnapshotAt
    ? Date.now() - row.gbpLocationsSnapshotAt.getTime()
    : Number.POSITIVE_INFINITY;
  const parsedExisting = parseSnapshot(row?.gbpLocationsSnapshot);

  if (parsedExisting && ageMs < FRESH_MS) {
    return {
      accountCount: parsedExisting.accountCount,
      allLocations: parsedExisting.locations,
      source: 'db_fresh',
    };
  }

  try {
    const live = await pullFromGoogleApi(googleEmail);
    await prisma.googleBusinessConnection.update({
      where: { googleEmail },
      data: {
        gbpLocationsSnapshot: live as object,
        gbpLocationsSnapshotAt: new Date(),
      },
    });
    return {
      accountCount: live.accountCount,
      allLocations: live.locations,
      source: 'api',
    };
  } catch (err) {
    if (parsedExisting && row?.gbpLocationsSnapshotAt && ageMs < STALE_FALLBACK_MAX_MS) {
      return {
        accountCount: parsedExisting.accountCount,
        allLocations: parsedExisting.locations,
        source: 'db_stale',
      };
    }
    throw err;
  }
}
