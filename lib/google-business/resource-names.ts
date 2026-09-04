/**
 * Resource names are interpolated into URL paths raw. Percent-encoding the slash breaks the
 * gRPC transcoding templates (`{parent=accounts/*}` never matches `accounts%2F123`), and Google
 * answers with a generic HTML 404 from its frontend instead of a JSON API error.
 */

type GbpCollection = 'accounts' | 'locations';

const VALID_ID = /^[A-Za-z0-9_.-]+$/;

function extractId(raw: string | null | undefined, collection: GbpCollection): string {
  const text = (raw ?? '').trim();
  if (!text) {
    throw new Error(
      `Google Business ${collection} resource name is empty, so no request URL was built.`,
    );
  }

  // Tolerate a caller that already percent-encoded the name.
  const segments = text
    .replace(/%2f/gi, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const marker = segments.lastIndexOf(collection);
  const id = marker >= 0 ? segments[marker + 1] : segments.length === 1 ? segments[0] : undefined;

  if (!id) {
    throw new Error(
      `Google Business ${collection} resource name "${text}" has no ${collection} id, so no request URL was built.`,
    );
  }
  if (id === 'undefined' || id === 'null' || !VALID_ID.test(id)) {
    throw new Error(
      `Google Business ${collection} id "${id}" is not a valid resource id, so no request URL was built.`,
    );
  }
  return id;
}

/** Accepts `123`, `accounts/123`, or a double-prefixed `accounts/accounts/123`. */
export function normalizeGbpAccountName(raw: string | null | undefined): string {
  return `accounts/${extractId(raw, 'accounts')}`;
}

/** Accepts `456`, `locations/456`, or a full `accounts/123/locations/456`. */
export function normalizeGbpLocationName(raw: string | null | undefined): string {
  return `locations/${extractId(raw, 'locations')}`;
}
