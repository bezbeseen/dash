import { normalizeGbpAccountName } from '@/lib/google-business/resource-names';

export const GBP_ACCOUNT_MANAGEMENT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
export const GBP_BUSINESS_INFORMATION_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';

/** `readMask` is required on accounts.locations.list; omitting it is a 400, not a 404. */
export const GBP_LOCATION_READ_MASK = 'name,title,websiteUri';

/** accounts.list caps pageSize at 20; locations.list caps it at 100. */
const ACCOUNTS_PAGE_SIZE = 20;
const LOCATIONS_PAGE_SIZE = 100;

export function gbpAccountsListUrl(pageSize = ACCOUNTS_PAGE_SIZE): string {
  return `${GBP_ACCOUNT_MANAGEMENT_BASE}/accounts?pageSize=${pageSize}`;
}

export function gbpLocationsListUrl(
  accountResourceName: string,
  pageSize = LOCATIONS_PAGE_SIZE,
): string {
  const parent = normalizeGbpAccountName(accountResourceName);
  const params = new URLSearchParams({
    readMask: GBP_LOCATION_READ_MASK,
    pageSize: String(pageSize),
  });
  return `${GBP_BUSINESS_INFORMATION_BASE}/${parent}/locations?${params.toString()}`;
}
