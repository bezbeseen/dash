/**
 * Period-over-period comparison logic, kept out of the JSX so it can be asserted directly.
 *
 * Below this many events in the prior period a percentage describes sampling noise rather than the
 * business: at a baseline of 2 a single extra event is 50%, and at 8 it is 12.5%. Ten is the point
 * where relative noise (roughly 1/sqrt(n)) drops under a third, so counts below it are reported as
 * the raw movement instead - "2 to 1" is honest where "-50%" is not. Rates and durations are not
 * event counts, so the rule is opt-out for them.
 */
export const SMALL_SAMPLE_BASELINE = 10;

export type DeltaVerdict =
  | { kind: 'no_prior' }
  | { kind: 'raw'; from: number; to: number }
  | { kind: 'percent'; change: number; flat: boolean; good: boolean };

export function describeDelta(
  current: number,
  previous: number,
  lowerIsBetter = false,
  isCount = true,
): DeltaVerdict {
  if (previous <= 0) return { kind: 'no_prior' };
  if (isCount && previous < SMALL_SAMPLE_BASELINE) {
    return { kind: 'raw', from: previous, to: current };
  }
  const change = (current - previous) / previous;
  const up = change >= 0;
  return { kind: 'percent', change, flat: Math.abs(change) < 0.005, good: lowerIsBetter ? !up : up };
}
