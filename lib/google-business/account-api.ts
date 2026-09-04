import { gbpFetchJson } from '@/lib/google-business/api-client';
import { gbpAccountsListUrl, gbpLocationsListUrl } from '@/lib/google-business/api-urls';

export type GbpAccount = { name: string; accountName?: string };

export async function listGbpAccounts(accessToken: string): Promise<{ accounts?: GbpAccount[] }> {
  return gbpFetchJson<{ accounts?: GbpAccount[] }>(
    'GBP accounts.list',
    gbpAccountsListUrl(),
    accessToken,
  );
}

export type GbpLocation = { name?: string; title?: string; websiteUri?: string };

export async function listGbpLocations(
  accessToken: string,
  accountResourceName: string,
): Promise<{ locations?: GbpLocation[] }> {
  return gbpFetchJson<{ locations?: GbpLocation[] }>(
    'GBP locations.list',
    gbpLocationsListUrl(accountResourceName),
    accessToken,
  );
}
