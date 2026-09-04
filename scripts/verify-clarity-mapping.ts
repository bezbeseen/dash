/**
 * Checks the Microsoft Clarity Data Export mapping. Clarity ships undocumented field names that
 * share long tokens, so most of these assert what must NOT happen: no cross-field matching, no
 * invented zeroes, and no silently reconciled nonsense.
 * Run `npm run verify:clarity-mapping` after changing lib/analytics/clarity-api.ts.
 */
import {
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
 * Shaped after the live production payload behind the panel: 9 human sessions, 12 bot sessions,
 * 19 distinct users. Numeric strings and mixed casing are reproduced exactly as Clarity sends them
 * (see the sample in the Data Export API docs and microsoft/clarity#640).
 */
const LIVE_PAYLOAD = [
  {
    metricName: 'Traffic',
    information: [
      {
        totalSessionCount: '9',
        totalBotSessionCount: '12',
        distantUserCount: '19',
        PagesPerSessionPercentage: 1.4137,
      },
    ],
  },
  {
    metricName: 'EngagementTime',
    information: [{ totalTime: '1204', activeTime: '51' }],
  },
  {
    metricName: 'ScrollDepth',
    information: [{ averageScrollDepth: 36.0 }],
  },
  {
    metricName: 'DeadClickCount',
    information: [
      {
        sessionsCount: '9',
        sessionsWithMetricPercentage: 33.333,
        sessionsWithoutMetricPercentage: 66.667,
        pagesViews: '5',
        subTotal: '5',
      },
    ],
  },
  {
    metricName: 'QuickbackClick',
    information: [
      {
        sessionsCount: '9',
        sessionsWithMetricPercentage: 11.111,
        sessionsWithoutMetricPercentage: 88.889,
        pagesViews: '1',
        subTotal: '1',
      },
    ],
  },
];

// ---- realistic payload maps to the expected typed shape
const live = mapClarityInsights(LIVE_PAYLOAD, 3);
check('traffic: totalSessionCount is the human (bot-excluded) count', live.traffic.humanSessions, 9);
check('traffic: bot sessions read from totalBotSessionCount', live.traffic.botSessions, 12);
check('traffic: distantUserCount is the docs spelling of the user count', live.traffic.distinctUsers, 19);
check('traffic: PagesPerSessionPercentage is a ratio, not a percentage', live.traffic.pagesPerSession, 1.4137);
check('scroll depth mapped', live.averageScrollDepth, 36);
check('engagement: active time mapped', live.activeEngagementSeconds, 51);
check('engagement: total time mapped', live.totalEngagementSeconds, 1204);
check('numOfDays carried through', live.numOfDays, 3);

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
check('coercion: string seconds', stringy.activeEngagementSeconds, 90);

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
check('missing: engagement metric absent stays null', sparse.activeEngagementSeconds, null);
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
