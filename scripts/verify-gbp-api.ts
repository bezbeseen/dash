/**
 * Checks the Google Business Profile request builders and error classification. The rule that
 * matters is that resource names reach the URL path with real slashes: percent-encoding one makes
 * `{parent=accounts/*}` unmatchable, and Google answers with an HTML 404 from its frontend that
 * looks nothing like a permissions problem.
 * Run `npm run verify:gbp-api` after changing lib/google-business/*.
 */
import {
  buildGbpApiError,
  classifyResponseBody,
  diagnoseGbpFailure,
  parseGoogleErrorFields,
  redactUrl,
  summarizeResponseBody,
} from '../lib/google-business/api-errors';
import {
  GBP_LOCATION_READ_MASK,
  gbpAccountsListUrl,
  gbpLocationsListUrl,
} from '../lib/google-business/api-urls';
import {
  formatGbpMonthRange,
  gbpDailyMetricsUrl,
  gbpKeywordMonthRange,
  gbpKeywordMonthsForRange,
  gbpSearchKeywordsUrl,
  gbpTrailingRange,
  parseGbpSearchKeywords,
  GBP_KEYWORD_PAGE_SIZE,
} from '../lib/google-business/performance-api';
import { describeDelta, SMALL_SAMPLE_BASELINE } from '../lib/metrics/delta';
import {
  normalizeGbpAccountName,
  normalizeGbpLocationName,
} from '../lib/google-business/resource-names';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

function checkThrows(label: string, fn: () => unknown) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) failures++;
  console.log(`${threw ? 'PASS' : 'FAIL'}  ${label}`);
  if (!threw) console.log('        expected a thrown error, got a value');
}

// --- resource names -------------------------------------------------------

check('account: bare numeric id', normalizeGbpAccountName('123'), 'accounts/123');
check('account: already a resource name', normalizeGbpAccountName('accounts/123'), 'accounts/123');
check('account: double prefixed', normalizeGbpAccountName('accounts/accounts/123'), 'accounts/123');
check('account: percent-encoded slash', normalizeGbpAccountName('accounts%2F123'), 'accounts/123');
check('account: surrounding whitespace', normalizeGbpAccountName('  accounts/123  '), 'accounts/123');
check('account: trailing slash', normalizeGbpAccountName('accounts/123/'), 'accounts/123');
check(
  'account: id taken from a longer name, not the last segment',
  normalizeGbpAccountName('accounts/123/locations/456'),
  'accounts/123',
);

check('location: bare numeric id', normalizeGbpLocationName('456'), 'locations/456');
check('location: already a resource name', normalizeGbpLocationName('locations/456'), 'locations/456');
check('location: full account path', normalizeGbpLocationName('accounts/123/locations/456'), 'locations/456');
check('location: double prefixed', normalizeGbpLocationName('locations/locations/456'), 'locations/456');

checkThrows('account: empty string is rejected', () => normalizeGbpAccountName(''));
checkThrows('account: whitespace only is rejected', () => normalizeGbpAccountName('   '));
checkThrows('account: undefined is rejected', () => normalizeGbpAccountName(undefined));
checkThrows('account: null is rejected', () => normalizeGbpAccountName(null));
checkThrows('account: literal "undefined" id is rejected', () => normalizeGbpAccountName('accounts/undefined'));
checkThrows('account: missing id after prefix is rejected', () => normalizeGbpAccountName('accounts/'));
checkThrows('account: ambiguous multi-segment is rejected', () => normalizeGbpAccountName('foo/bar'));
checkThrows('location: empty string is rejected', () => normalizeGbpLocationName(''));

// --- URL builders ---------------------------------------------------------

check(
  'accounts.list matches the documented endpoint',
  gbpAccountsListUrl(),
  'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20',
);

const locationsUrl = gbpLocationsListUrl('accounts/123');
check(
  'locations.list matches the documented endpoint',
  locationsUrl,
  'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?readMask=name%2Ctitle%2CwebsiteUri&pageSize=100',
);
check('locations.list keeps a literal slash in the parent', locationsUrl.includes('/v1/accounts/123/locations'), true);
check('locations.list never percent-encodes the parent slash', /accounts%2F/i.test(locationsUrl), false);
check('locations.list sends the required readMask', locationsUrl.includes('readMask='), true);
check('readMask holds only documented Location fields', GBP_LOCATION_READ_MASK, 'name,title,websiteUri');
check(
  'locations.list normalizes a double-prefixed parent',
  gbpLocationsListUrl('accounts/accounts/123') === locationsUrl,
  true,
);
checkThrows('locations.list refuses to build a URL without an account', () => gbpLocationsListUrl(''));
checkThrows('locations.list refuses an undefined account id', () => gbpLocationsListUrl('accounts/undefined'));

const range = { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 2, 31)) };
check(
  'fetchMultiDailyMetricsTimeSeries matches the documented endpoint',
  gbpDailyMetricsUrl('locations/12345', ['WEBSITE_CLICKS', 'CALL_CLICKS'], range),
  'https://businessprofileperformance.googleapis.com/v1/locations/12345:fetchMultiDailyMetricsTimeSeries?dailyMetrics=WEBSITE_CLICKS&dailyMetrics=CALL_CLICKS&dailyRange.start_date.year=2026&dailyRange.start_date.month=1&dailyRange.start_date.day=1&dailyRange.end_date.year=2026&dailyRange.end_date.month=3&dailyRange.end_date.day=31',
);
check(
  'searchkeywords matches the documented endpoint',
  gbpSearchKeywordsUrl('locations/12345', { startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3 }),
  'https://businessprofileperformance.googleapis.com/v1/locations/12345/searchkeywords/impressions/monthly?monthlyRange.start_month.year=2026&monthlyRange.start_month.month=1&monthlyRange.end_month.year=2026&monthlyRange.end_month.month=3&pageSize=100',
);
check('searchkeywords sends the documented maximum page size', GBP_KEYWORD_PAGE_SIZE, 100);
check(
  'performance URLs accept a full account path for the location',
  gbpDailyMetricsUrl('accounts/123/locations/12345', ['CALL_CLICKS'], range).includes('/v1/locations/12345:'),
  true,
);

const trailing = gbpTrailingRange(28);
check('trailing range spans the requested day count', Math.round((trailing.end.getTime() - trailing.start.getTime()) / 86_400_000) + 1, 28);
check('trailing range ends before today for reporting lag', trailing.end.getTime() < Date.now(), true);

// --- response body classification ----------------------------------------

const GOOGLE_HTML_404 = `<!DOCTYPE html>
<html lang=en>
  <meta charset=utf-8>
  <meta name=viewport content="initial-scale=1, minimum-scale=1, width=device-width">
  <title>Error 404 (Not Found)!!1</title>
  <style>
    *{margin:0;padding:0}html,code{font:15px/22px arial,sans-serif}
  </style>
  <a href=//www.google.com/><span id=logo aria-label=Google></span></a>
  <p><b>404.</b> <ins>That's an error.</ins>
  <p>The requested URL <code>/v1/accounts%2F123/locations</code> was not found on this server.
  <ins>That's all we know.</ins>
`;

check('body kind: HTML by content type', classifyResponseBody('text/html; charset=UTF-8', GOOGLE_HTML_404), 'html');
check('body kind: HTML by leading angle bracket', classifyResponseBody(null, '<html></html>'), 'html');
check('body kind: JSON by content type', classifyResponseBody('application/json', '{"error":{}}'), 'json');
check('body kind: JSON by leading brace', classifyResponseBody(null, '  {"error":{}}'), 'json');
check('body kind: empty body', classifyResponseBody('text/html', '   '), 'empty');
check('body kind: plain text', classifyResponseBody('text/plain', 'upstream connect error'), 'text');

const htmlSummary = summarizeResponseBody('text/html', GOOGLE_HTML_404);
check('HTML summary is reported as HTML', htmlSummary.kind, 'html');
check('HTML summary drops every tag', /[<>]/.test(htmlSummary.snippet), false);
check('HTML summary drops inline CSS', htmlSummary.snippet.includes('padding'), false);
check('HTML summary collapses whitespace', /\s{2,}|\n/.test(htmlSummary.snippet), false);
check('HTML summary is hard capped', htmlSummary.snippet.length <= 220, true);
check('HTML summary keeps the useful sentence', htmlSummary.snippet.includes("That's an error"), true);

// --- failure diagnosis ----------------------------------------------------

function reasonFor(status: number, contentType: string, body: string) {
  const { kind } = summarizeResponseBody(contentType, body);
  return diagnoseGbpFailure(status, kind, kind === 'json' ? parseGoogleErrorFields(body) : null);
}

check('diagnosis: HTML 404 is an endpoint problem', reasonFor(404, 'text/html', GOOGLE_HTML_404), 'endpoint');
check(
  'diagnosis: HTML 403 is still an endpoint problem',
  reasonFor(403, 'text/html', '<html><title>Error 403</title></html>'),
  'endpoint',
);
check(
  'diagnosis: JSON 403 SERVICE_DISABLED',
  reasonFor(
    403,
    'application/json',
    '{"error":{"code":403,"message":"Business Profile Performance API has not been used in project 42 before or it is disabled.","status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}',
  ),
  'api_disabled',
);
check(
  'diagnosis: JSON 429 quota',
  reasonFor(
    429,
    'application/json',
    '{"error":{"code":429,"message":"Quota exceeded for quota metric requests","status":"RESOURCE_EXHAUSTED"}}',
  ),
  'quota',
);
check(
  'diagnosis: JSON 403 rate limit is quota, not permission',
  reasonFor(
    403,
    'application/json',
    '{"error":{"code":403,"message":"Rate Limit Exceeded","status":"PERMISSION_DENIED","details":[{"reason":"rateLimitExceeded"}]}}',
  ),
  'quota',
);
check(
  'diagnosis: JSON 403 insufficient scope',
  reasonFor(
    403,
    'application/json',
    '{"error":{"code":403,"message":"Request had insufficient authentication scopes.","status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}',
  ),
  'scope',
);
check(
  'diagnosis: JSON 403 plain permission denial',
  reasonFor(
    403,
    'application/json',
    '{"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}',
  ),
  'permission',
);
check(
  'diagnosis: JSON 404 is a missing resource, not a bad endpoint',
  reasonFor(404, 'application/json', '{"error":{"code":404,"message":"Requested entity was not found.","status":"NOT_FOUND"}}'),
  'not_found',
);
check(
  'diagnosis: JSON 400 missing readMask is a bad request',
  reasonFor(
    400,
    'application/json',
    '{"error":{"code":400,"message":"Request contains an invalid argument: read_mask is required","status":"INVALID_ARGUMENT"}}',
  ),
  'bad_request',
);
check('diagnosis: JSON 500 is unknown', reasonFor(500, 'application/json', '{"error":{"code":500}}'), 'unknown');
check('google fields: non-JSON yields null', parseGoogleErrorFields('<html></html>'), null);
check('google fields: JSON without an error envelope yields null', parseGoogleErrorFields('{"locations":[]}'), null);

// --- user-facing error objects -------------------------------------------

const htmlError = buildGbpApiError(
  'GBP locations.list',
  'https://mybusinessbusinessinformation.googleapis.com/v1/accounts%2F123/locations?readMask=name',
  404,
  'text/html; charset=UTF-8',
  GOOGLE_HTML_404,
);
check('html error: reason', htmlError.reason, 'endpoint');
check('html error: body kind', htmlError.bodyKind, 'html');
check('html error: status', htmlError.httpStatus, 404);
check('html error: message carries no markup', /[<>]/.test(htmlError.message), false);
check('html error: message stays short', htmlError.message.length <= 500, true);
check('html error: message blames the URL, not permissions', htmlError.message.includes('request URL'), true);
check(
  'html error: message says it is not an approval problem',
  htmlError.message.includes('not a permissions or approval problem'),
  true,
);
check('html error: message names the call', htmlError.message.startsWith('GBP locations.list'), true);
check('html error: raw doctype never reaches the message', htmlError.message.includes('DOCTYPE'), false);

const disabledError = buildGbpApiError(
  'GBP performance.fetchMultiDailyMetricsTimeSeries',
  'https://businessprofileperformance.googleapis.com/v1/locations/1:fetchMultiDailyMetricsTimeSeries',
  403,
  'application/json',
  '{"error":{"code":403,"message":"Business Profile Performance API has not been used in project 42 before or it is disabled.","status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}',
);
check('json error: reason', disabledError.reason, 'api_disabled');
check('json error: keeps Google\'s own wording', disabledError.message.includes('has not been used in project'), true);
check('json error: names the status and reason', disabledError.message.includes('SERVICE_DISABLED'), true);
check('json error: stays short', disabledError.message.length <= 240, true);

check(
  'redaction: tokeninfo access_token is stripped',
  redactUrl('https://oauth2.googleapis.com/tokeninfo?access_token=ya29.secret'),
  'https://oauth2.googleapis.com/tokeninfo?access_token=REDACTED',
);
check(
  'redaction: leaves ordinary query params alone',
  redactUrl('https://example.googleapis.com/v1/accounts?pageSize=20'),
  'https://example.googleapis.com/v1/accounts?pageSize=20',
);
check(
  'redaction: applied when the error is built',
  buildGbpApiError('Google tokeninfo', 'https://oauth2.googleapis.com/tokeninfo?access_token=ya29.secret', 401, 'application/json', '{}').url,
  'https://oauth2.googleapis.com/tokeninfo?access_token=REDACTED',
);

// Keyword months: the endpoint only answers in whole calendar months, and never the current one.
const midMonth = new Date(Date.UTC(2026, 8, 4)); // 2026-09-04, four days into September

check('keyword months: 7d asks for one whole month', gbpKeywordMonthsForRange(7), 1);
check('keyword months: 28d asks for one whole month', gbpKeywordMonthsForRange(28), 1);
check('keyword months: 90d asks for three whole months', gbpKeywordMonthsForRange(90), 3);

check(
  'keyword range: a 7d selector still resolves to the last complete month, not a partial week',
  gbpKeywordMonthRange(gbpKeywordMonthsForRange(7), 0, midMonth),
  { startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8 },
);
check(
  'keyword range: 28d excludes the incomplete current month',
  gbpKeywordMonthRange(gbpKeywordMonthsForRange(28), 0, midMonth),
  { startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8 },
);
check(
  'keyword range: 90d covers three complete months ending last month',
  gbpKeywordMonthRange(gbpKeywordMonthsForRange(90), 0, midMonth),
  { startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 8 },
);
check(
  'keyword range: the fallback steps back one further whole month',
  gbpKeywordMonthRange(1, 1, midMonth),
  { startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7 },
);
check(
  'keyword range: never includes the current month even on its first day',
  gbpKeywordMonthRange(1, 0, new Date(Date.UTC(2026, 8, 1))),
  { startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8 },
);
check(
  'keyword range: in January it stays entirely in the previous year',
  gbpKeywordMonthRange(3, 0, new Date(Date.UTC(2026, 0, 15))),
  { startYear: 2025, startMonth: 10, endYear: 2025, endMonth: 12 },
);
check(
  'keyword range: a span may still cross a year boundary',
  gbpKeywordMonthRange(3, 0, new Date(Date.UTC(2026, 1, 15))),
  { startYear: 2025, startMonth: 11, endYear: 2026, endMonth: 1 },
);
check(
  'keyword range: fallback crosses a year boundary correctly',
  gbpKeywordMonthRange(1, 1, new Date(Date.UTC(2026, 0, 15))),
  { startYear: 2025, startMonth: 11, endYear: 2025, endMonth: 11 },
);
check(
  'keyword range: request never reaches into the current month',
  gbpKeywordMonthRange(3, 0, midMonth).endMonth < midMonth.getUTCMonth() + 1,
  true,
);

check(
  'month label: a single month reads as one month',
  formatGbpMonthRange({ startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8 }),
  'August 2026',
);
check(
  'month label: a span names both ends',
  formatGbpMonthRange({ startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 8 }),
  'June 2026 to August 2026',
);

// Keyword parsing: a threshold is Google withholding a small count, so the row must survive.
const keywordBody = {
  searchKeywordsCounts: [
    { searchKeyword: 'sign shop near me', insightsValue: { value: '31' } },
    { searchKeyword: 'custom banners', insightsValue: { threshold: '15' } },
    { searchKeyword: '  vehicle wraps  ', insightsValue: { threshold: '15' } },
    { searchKeyword: '', insightsValue: { value: '99' } },
  ],
};
check(
  'keyword parsing: threshold-only rows are kept, blank keywords dropped',
  parseGbpSearchKeywords(keywordBody, 10),
  [
    { keyword: 'sign shop near me', count: 31, belowThreshold: false },
    { keyword: 'custom banners', count: 15, belowThreshold: true },
    { keyword: 'vehicle wraps', count: 15, belowThreshold: true },
  ],
);
check(
  'keyword parsing: a list of only thresholds is not emptied',
  parseGbpSearchKeywords(
    { searchKeywordsCounts: [{ searchKeyword: 'led signs', insightsValue: { threshold: '15' } }] },
    10,
  ).length,
  1,
);
check('keyword parsing: an absent list is an empty list', parseGbpSearchKeywords({}, 10), []);
check(
  'keyword parsing: honours the requested limit',
  parseGbpSearchKeywords(keywordBody, 1),
  [{ keyword: 'sign shop near me', count: 31, belowThreshold: false }],
);

// Delta suppression: percentages on tiny baselines are noise, so they become raw movement.
check('delta: a zero baseline has no prior data', describeDelta(5, 0).kind, 'no_prior');
check('delta: 0 to 0 has no prior data', describeDelta(0, 0).kind, 'no_prior');
check('delta: baseline 1 is too small for a percentage', describeDelta(3, 1), { kind: 'raw', from: 1, to: 3 });
check('delta: calls 2 to 1 shows the movement, not -50%', describeDelta(1, 2), { kind: 'raw', from: 2, to: 1 });
check('delta: clicks 8 to 5 shows the movement, not -37.5%', describeDelta(5, 8), { kind: 'raw', from: 8, to: 5 });
check(
  'delta: baseline 9 is still suppressed, 10 is not',
  [describeDelta(20, 9).kind, describeDelta(20, 10).kind],
  ['raw', 'percent'],
);
check('delta: the threshold is the documented baseline', SMALL_SAMPLE_BASELINE, 10);
check(
  'delta: baseline 23 to 48 keeps its percentage',
  describeDelta(48, 23),
  { kind: 'percent', change: (48 - 23) / 23, flat: false, good: true },
);
check(
  'delta: GA4-scale counts are untouched by the rule',
  [describeDelta(198, 179).kind, describeDelta(1240, 1100).kind, describeDelta(540, 600).kind],
  ['percent', 'percent', 'percent'],
);
check(
  'delta: a suppressed movement is never scored good or bad',
  Object.prototype.hasOwnProperty.call(describeDelta(1, 2), 'good'),
  false,
);
check(
  'delta: an unchanged large count still reads flat',
  describeDelta(500, 500),
  { kind: 'percent', change: 0, flat: true, good: true },
);

check(
  'delta: lowerIsBetter still inverts a rise into bad news',
  [describeDelta(60, 50, true).kind, (describeDelta(60, 50, true) as { good: boolean }).good],
  ['percent', false],
);
check(
  'delta: lowerIsBetter still scores a fall as good',
  (describeDelta(40, 50, true) as { good: boolean }).good,
  true,
);
check(
  'delta: a bounce rate of 0.45 is not treated as a small sample',
  describeDelta(0.42, 0.45, true, false).kind,
  'percent',
);
check(
  'delta: a short average session is not treated as a small sample',
  describeDelta(7.5, 6, false, false).kind,
  'percent',
);
check(
  'delta: a rate keeps lowerIsBetter scoring while opting out of the count rule',
  (describeDelta(0.52, 0.45, true, false) as { good: boolean }).good,
  false,
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
