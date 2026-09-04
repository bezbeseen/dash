/**
 * Checks the Microsoft Clarity Data Export mapping. Clarity ships undocumented field names that
 * share long tokens, so most of these assert what must NOT happen: no cross-field matching, no
 * invented zeroes, and no silently reconciled nonsense.
 * Run `npm run verify:clarity-mapping` after changing lib/analytics/clarity-api.ts.
 */
import {
  activeTimeSharePercentage,
  botSharePercentage,
  mapClarityInsights,
  pickNumber,
  recordedSessions,
  signalAffectedSessions,
} from '../lib/analytics/clarity-api';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

/**
 * Ground truth: the real production payload, captured from /api/integrations/clarity?raw=1.
 * Field names and values are exactly what the live API returned — note `distinctUserCount`, which
 * contradicts the `distantUserCount` in Microsoft's published sample. Session counts are typed as
 * strings the way the docs sample shows them while the newer fields arrive as JSON numbers, which
 * is the mixed typing the mapper has to absorb. Long row lists are trimmed to the rows the
 * assertions depend on.
 */
const LIVE_PAYLOAD = [
  {
    metricName: 'Traffic',
    information: [
      {
        totalSessionCount: '9',
        totalBotSessionCount: '12',
        distinctUserCount: '19',
        pagesPerSessionPercentage: 1.4090909090909092,
      },
    ],
  },
  {
    metricName: 'EngagementTime',
    information: [{ totalTime: 212, activeTime: 51 }],
  },
  {
    metricName: 'ScrollDepth',
    information: [{ averageScrollDepth: 36 }],
  },
  {
    metricName: 'DeadClickCount',
    information: [
      {
        sessionsCount: 9,
        sessionsWithMetricPercentage: 33.333,
        sessionsWithoutMetricPercentage: 66.667,
        pagesViews: 5,
        subTotal: 5,
      },
    ],
  },
  {
    metricName: 'QuickbackClick',
    information: [
      {
        sessionsCount: 9,
        sessionsWithMetricPercentage: 11.111,
        sessionsWithoutMetricPercentage: 88.889,
        pagesViews: 1,
        subTotal: 1,
      },
    ],
  },
  {
    metricName: 'PopularPages',
    information: [
      { url: 'https://www.getbeseen.com/', visitsCount: 5 },
      { url: 'https://getbeseen.com/', visitsCount: 3 },
      { url: 'https://getbeseen.com/products/signs/window-graphics.html', visitsCount: 2 },
    ],
  },
  {
    metricName: 'ReferrerUrl',
    information: [
      { name: null, sessionsCount: 3 },
      { name: 'https://www.google.com/', sessionsCount: 2 },
      { name: 'https://getbeseen.com/products/signs/window-graphics.html', sessionsCount: 2 },
      { name: 'https://www.bing.com/', sessionsCount: 1 },
      { name: 'https://appcenter.intuit.com/', sessionsCount: 1 },
      { name: 'https://yelp-sales.lightning.force.com/', sessionsCount: 1 },
    ],
  },
  {
    metricName: 'PageTitle',
    information: [
      { name: 'GetBeSeen - Professional Printing, Design & Marketing | Santa Clara, CA', sessionsCount: 6 },
      { name: 'Window Graphics | GetBeSeen', sessionsCount: 2 },
    ],
  },
  { metricName: 'Browser', information: [{ name: 'Chrome', sessionsCount: 7 }, { name: 'Edge', sessionsCount: 2 }] },
  { metricName: 'OS', information: [{ name: 'MacOSX', sessionsCount: 6 }, { name: 'Windows', sessionsCount: 3 }] },
  { metricName: 'Device', information: [{ name: 'PC', sessionsCount: 9 }] },
  { metricName: 'Country', information: [{ name: 'United States', sessionsCount: 9 }] },
];

// ---- realistic payload maps to the expected typed shape
const live = mapClarityInsights(LIVE_PAYLOAD, 3);
check('traffic: totalSessionCount is the human (bot-excluded) count', live.traffic.humanSessions, 9);
check('traffic: bot sessions read from totalBotSessionCount', live.traffic.botSessions, 12);
check('traffic: the live spelling distinctUserCount resolves', live.traffic.distinctUsers, 19);
check('traffic: pagesPerSessionPercentage is a ratio, not a percentage', live.traffic.pagesPerSession, 1.4090909090909092);
check('scroll depth is already a percentage', live.averageScrollDepth, 36);
check('engagement: active seconds per session', live.averageActiveTimeSeconds, 51);
check('engagement: total seconds per session', live.averageTotalTimeSeconds, 212);
check('engagement: active share matches Clarity\u2019s own Active Time %', activeTimeSharePercentage(live), (51 / 212) * 100);
check('numOfDays carried through', live.numOfDays, 3);

// The docs sample spells it distantUserCount; the live API does not. Both must resolve.
check(
  'traffic: the docs spelling distantUserCount is still accepted as a fallback',
  mapClarityInsights([{ metricName: 'Traffic', information: [{ distantUserCount: '189733' }] }], 1).traffic
    .distinctUsers,
  189733,
);
check(
  'traffic: the live spelling wins when a payload somehow carries both',
  mapClarityInsights(
    [{ metricName: 'Traffic', information: [{ distinctUserCount: 19, distantUserCount: 999 }] }],
    1,
  ).traffic.distinctUsers,
  19,
);

check('bots can exceed humans because Clarity filters them out of the session count', recordedSessions(live.traffic), 21);
check('bot share is measured against recorded sessions, not human ones', botSharePercentage(live.traffic), (12 / 21) * 100);

const deadClicks = live.signals.find((s) => s.key === 'DeadClickCount');
check('signal: percentage read from sessionsWithMetricPercentage', deadClicks?.sessionPercentage, 33.333);
check('signal: subTotal is the occurrence count', deadClicks?.occurrences, 5);
check('signal: sessionsCount is captured as the percentage denominator', deadClicks?.sessionScope, 9);
check('signal: affected sessions reconstructed from percentage x denominator', signalAffectedSessions(deadClicks!), 3);
check(
  'signal: denominator matches the human session count, so no scope warning',
  live.warnings.some((w) => w.includes('different session sets')),
  false,
);

const quickBacks = live.signals.find((s) => s.key === 'QuickbackClick');
check('signal: 11.1% of 9 sessions is 1', signalAffectedSessions(quickBacks!), 1);

check('signals: every documented metric gets a row even when absent', live.signals.length, 6);
const rageClicks = live.signals.find((s) => s.key === 'RageClickCount');
check('signal: metric missing from the payload is null, not zero', rageClicks?.sessionPercentage, null);
check('signal: missing occurrences are null, not zero', rageClicks?.occurrences, null);

// ---- all seven breakdowns parse out of the same free response
check('breakdown: popular pages parsed', live.breakdowns.popularPages.length, 2);
check('breakdown: referrers parsed', live.breakdowns.referrers.length, 6);
check('breakdown: page titles parsed', live.breakdowns.pageTitles.length, 2);
check('breakdown: browsers parsed', live.breakdowns.browsers.length, 2);
check('breakdown: operating systems parsed', live.breakdowns.operatingSystems.length, 2);
check('breakdown: devices parsed', live.breakdowns.devices.length, 1);
check('breakdown: countries parsed', live.breakdowns.countries.length, 1);

check('breakdown: plain rows read name/sessionsCount', live.breakdowns.browsers[0], {
  key: 'chrome',
  label: 'Chrome',
  href: null,
  count: 7,
});
check('breakdown: OS ordering is highest first', live.breakdowns.operatingSystems.map((r) => r.label), [
  'MacOSX',
  'Windows',
]);
check('breakdown: page titles are left verbatim', live.breakdowns.pageTitles[1]?.label, 'Window Graphics | GetBeSeen');

// PopularPages diverges from every other breakdown: url/visitsCount rather than name/sessionsCount.
check('breakdown: pages read the url/visitsCount pair', live.breakdowns.popularPages[0], {
  key: 'getbeseen.com/',
  label: '/',
  href: 'https://www.getbeseen.com/',
  count: 8,
});
check(
  'breakdown: www and non-www variants of one page merge into a single row',
  live.breakdowns.popularPages.filter((r) => r.label === '/').length,
  1,
);
check(
  'breakdown: merging sums the split counts rather than showing the larger half',
  live.breakdowns.popularPages[0]?.count,
  5 + 3,
);
check('breakdown: deeper paths keep their full path as the label', live.breakdowns.popularPages[1], {
  key: 'getbeseen.com/products/signs/window-graphics.html',
  label: '/products/signs/window-graphics.html',
  href: 'https://getbeseen.com/products/signs/window-graphics.html',
  count: 2,
});

// A null referrer name is Clarity's way of saying the visitor arrived directly.
check('breakdown: null referrer becomes Direct', live.breakdowns.referrers[0], {
  key: 'direct',
  label: 'Direct',
  href: null,
  count: 3,
});
check(
  'breakdown: referrers collapse to host, dropping the landing path',
  live.breakdowns.referrers.map((r) => r.label),
  ['Direct', 'google.com', 'getbeseen.com', 'bing.com', 'appcenter.intuit.com', 'yelp-sales.lightning.force.com'],
);
check('breakdown: referrer host links back to that host root', live.breakdowns.referrers[1]?.href, 'https://www.google.com/');
check(
  'breakdown: a self-referral keeps its own host rather than becoming Direct',
  live.breakdowns.referrers[2],
  { key: 'getbeseen.com', label: 'getbeseen.com', href: 'https://getbeseen.com/', count: 2 },
);
check(
  'breakdown: two referrer paths on one host merge into a single host row',
  mapClarityInsights(
    [
      {
        metricName: 'ReferrerUrl',
        information: [
          { name: 'https://www.google.com/', sessionsCount: 2 },
          { name: 'https://google.com/search?q=signs', sessionsCount: 4 },
        ],
      },
    ],
    1,
  ).breakdowns.referrers,
  [{ key: 'google.com', label: 'google.com', href: 'https://www.google.com/', count: 6 }],
);

const unparseable = mapClarityInsights(
  [
    {
      metricName: 'ReferrerUrl',
      information: [
        { name: 'android-app://com.google.android.gm', sessionsCount: 2 },
        { name: 'nonsense referrer', sessionsCount: 1 },
      ],
    },
    { metricName: 'PopularPages', information: [{ url: 'not a url', visitsCount: 1 }] },
  ],
  1,
);
check(
  'breakdown: a non-http referrer scheme still reduces to its host',
  unparseable.breakdowns.referrers[0]?.label,
  'com.google.android.gm',
);
check('breakdown: an unparseable referrer is kept verbatim', unparseable.breakdowns.referrers[1]?.label, 'nonsense referrer');
check('breakdown: an unparseable page url is kept verbatim with no link', unparseable.breakdowns.popularPages[0], {
  key: 'not a url',
  label: 'not a url',
  href: null,
  count: 1,
});

// ---- absent or unusable breakdowns yield an empty list so the panel can omit the table
const sparseBreakdowns = mapClarityInsights(
  [
    { metricName: 'Browser', information: [] },
    { metricName: 'OS', information: [{ name: 'Windows' }] },
    { metricName: 'PopularPages', information: [{ visitsCount: 3 }] },
    { metricName: 'Device', information: [{ name: null, sessionsCount: 4 }] },
  ],
  1,
);
check('breakdown: metric missing entirely yields an empty list', sparseBreakdowns.breakdowns.referrers, []);
check('breakdown: metric present but empty yields an empty list', sparseBreakdowns.breakdowns.browsers, []);
check('breakdown: a row with no count is skipped', sparseBreakdowns.breakdowns.operatingSystems, []);
check('breakdown: a page row with no url is skipped', sparseBreakdowns.breakdowns.popularPages, []);
check(
  'breakdown: a plain row with a null name is labelled rather than dropped',
  sparseBreakdowns.breakdowns.devices,
  [{ key: '(not set)', label: '(not set)', href: null, count: 4 }],
);

// ---- pickNumber must never cross-match a similarly named field
check('pickNumber: exact key match', pickNumber({ totalSessionCount: '9' }, ['totalSessionCount']), 9);
check('pickNumber: case-insensitive whole-key match', pickNumber({ TOTALSESSIONCOUNT: 9 }, ['totalSessionCount']), 9);
check(
  'pickNumber: totalBotSessionCount must not satisfy totalSessionCount',
  pickNumber({ totalBotSessionCount: '12' }, ['totalSessionCount']),
  null,
);
check(
  'pickNumber: sessionsWithoutMetricPercentage must not satisfy sessionsWithMetricPercentage',
  pickNumber({ sessionsWithoutMetricPercentage: 100 }, ['sessionsWithMetricPercentage']),
  null,
);
check(
  'pickNumber: a longer key with the alias as a prefix does not match',
  pickNumber({ distinctUserCountByDay: 5 }, ['distinctUserCount']),
  null,
);
check(
  'pickNumber: a longer key with the alias as a suffix does not match',
  pickNumber({ weeklyPagesPerSessionPercentage: 2 }, ['PagesPerSessionPercentage']),
  null,
);
check('pickNumber: absent key yields null', pickNumber({ other: 1 }, ['totalSessionCount']), null);
check('pickNumber: undefined row yields null', pickNumber(undefined, ['totalSessionCount']), null);
check(
  'pickNumber: first alias wins when both are present',
  pickNumber({ distantUserCount: 19, distinctUserCount: 4 }, ['distantUserCount', 'distinctUserCount']),
  19,
);
check(
  'pickNumber: falls through to the next alias when the first is unparseable',
  pickNumber({ distantUserCount: 'n/a', distinctUserCount: '4' }, ['distantUserCount', 'distinctUserCount']),
  4,
);

// ---- the Traffic session count must never be served by a frustration-metric field
check(
  'traffic: a row carrying only the signal-metric sessionsCount yields no session count',
  mapClarityInsights([{ metricName: 'Traffic', information: [{ sessionsCount: '99' }] }], 3).traffic.humanSessions,
  null,
);

// ---- string-typed numerics are coerced
const stringy = mapClarityInsights(
  [
    {
      metricName: 'Traffic',
      information: [
        { totalSessionCount: '1234', totalBotSessionCount: '7', distantUserCount: '88', PagesPerSessionPercentage: '2.5' },
      ],
    },
    { metricName: 'ScrollDepth', information: [{ averageScrollDepth: '41.5' }] },
    { metricName: 'EngagementTime', information: [{ activeTime: '90', totalTime: '300' }] },
  ],
  1,
);
check('coercion: numeric strings become numbers', stringy.traffic.humanSessions, 1234);
check('coercion: decimal string ratio', stringy.traffic.pagesPerSession, 2.5);
check('coercion: decimal string percentage', stringy.averageScrollDepth, 41.5);
check('coercion: string seconds', stringy.averageActiveTimeSeconds, 90);

const junk = mapClarityInsights(
  [{ metricName: 'Traffic', information: [{ totalSessionCount: '', totalBotSessionCount: 'NaN', distantUserCount: null }] }],
  1,
);
check('coercion: empty string is not zero', junk.traffic.humanSessions, null);
check('coercion: unparseable string is not zero', junk.traffic.botSessions, null);
check('coercion: null is not zero', junk.traffic.distinctUsers, null);

// ---- missing fields omit a card rather than rendering as zero
const sparse = mapClarityInsights([{ metricName: 'Traffic', information: [{ totalSessionCount: '5' }] }], 1);
check('missing: bot sessions absent stays null', sparse.traffic.botSessions, null);
check('missing: pages per session absent stays null', sparse.traffic.pagesPerSession, null);
check('missing: scroll depth metric absent stays null', sparse.averageScrollDepth, null);
check('missing: engagement metric absent stays null', sparse.averageActiveTimeSeconds, null);
check('missing: no engagement data means no active share to render', activeTimeSharePercentage(sparse), null);
check('missing: no bot data means no bot share to render', botSharePercentage(sparse.traffic), null);
check('missing: recorded sessions falls back to the human count alone', recordedSessions(sparse.traffic), 5);

const empty = mapClarityInsights([], 1);
check('empty payload: traffic is entirely null', empty.traffic.humanSessions, null);
check('empty payload: recorded sessions is null, not zero', recordedSessions(empty.traffic), null);
check('empty payload: still lists every signal', empty.signals.length, 6);

// ---- internally inconsistent payloads are flagged, not silently rendered
const impossible = mapClarityInsights(
  [
    {
      metricName: 'Traffic',
      information: [{ totalSessionCount: '9', totalBotSessionCount: '12', distantUserCount: '5000' }],
    },
  ],
  3,
);
check('inconsistent: users beyond every recorded session raises a warning', impossible.warnings.length, 1);
check(
  'inconsistent: the warning names both figures',
  impossible.warnings[0]?.includes('5000') && impossible.warnings[0]?.includes('21'),
  true,
);
check('inconsistent: the raw values are still reported, not clamped', impossible.traffic.distinctUsers, 5000);
check('inconsistent: session counts are left untouched', impossible.traffic.humanSessions, 9);
check(
  'consistent: users below the recorded session total is normal and silent',
  live.warnings.length,
  0,
);

const scopeMismatch = mapClarityInsights(
  [
    { metricName: 'Traffic', information: [{ totalSessionCount: '9' }] },
    { metricName: 'RageClickCount', information: [{ sessionsCount: '21', sessionsWithMetricPercentage: 50, subTotal: '3' }] },
  ],
  3,
);
check(
  'inconsistent: a frustration denominator that differs from Traffic is flagged',
  scopeMismatch.warnings.some((w) => w.includes('different session sets')),
  true,
);

const multiRow = mapClarityInsights(
  [
    {
      metricName: 'Traffic',
      information: [{ totalSessionCount: '9' }, { totalSessionCount: '4' }],
    },
  ],
  3,
);
check('inconsistent: extra Traffic rows are flagged rather than silently dropped', multiRow.warnings.length, 1);
check('inconsistent: the first Traffic row is the one used', multiRow.traffic.humanSessions, 9);

// ---- malformed shapes must not throw
check(
  'malformed: information missing entirely',
  mapClarityInsights([{ metricName: 'Traffic' }], 1).traffic.humanSessions,
  null,
);
check(
  'malformed: metric name casing is ignored',
  mapClarityInsights([{ metricName: 'traffic', information: [{ totalSessionCount: '3' }] }], 1).traffic.humanSessions,
  3,
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
