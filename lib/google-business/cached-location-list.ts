import { unstable_cache } from 'next/cache';
import { listGbpAccounts, listGbpLocations } from '@/lib/google-business/account-api';
import { getValidGoogleBusinessAccessToken } from '@/lib/google-business/tokens';

export type CachedGbpLocation = { name: string; title: string };

/** Cuts down Account Management + Business Information calls (429) when reloading GBP / Settings. */
const LIST_TTL_SECONDS = 300;

export const getCachedGbpLocationList = unstable_cache(
  async (googleEmail: string) => {
    const token = await getValidGoogleBusinessAccessToken(googleEmail);
    const { accounts } = await listGbpAccounts(token);
    const firstAccount = accounts?.[0];
    if (!firstAccount?.name) {
      return {
        accountCount: accounts?.length ?? 0,
        allLocations: [] as CachedGbpLocation[],
      };
    }
    const locRes = await listGbpLocations(token, firstAccount.name);
    const raw = locRes.locations ?? [];
    const allLocations: CachedGbpLocation[] = raw
      .filter((l) => l.name)
      .map((l) => ({
        name: l.name as string,
        title: (l.title || l.name || 'Location').trim(),
      }));
    return { accountCount: accounts?.length ?? 0, allLocations };
  },
  ['gbp-account-location-list'],
  { revalidate: LIST_TTL_SECONDS },
);
