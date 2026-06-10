import Link from 'next/link';
import {
  PREQUOTE_SOURCE_FILTERS,
  prequoteCallerLineRules,
  prequoteFilterHref,
  type PrequoteSourceFilter,
} from '@/lib/domain/prequote-triage';

type Props = {
  source: PrequoteSourceFilter;
  callerLineId: string | null;
  counts: { total: number; thin: number };
  lineCounts: Record<string, number>;
};

export function PrequoteBoardFilters({ source, callerLineId, counts, lineCounts }: Props) {
  const lineRules = prequoteCallerLineRules().filter((r) => (lineCounts[r.id] ?? 0) > 0);

  return (
    <div className="prequote-board-toolbar px-3 px-md-4 pb-3">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="small text-body-secondary fw-semibold me-1">Source</span>
        {PREQUOTE_SOURCE_FILTERS.map((f) => {
          const active = source === f.key && !callerLineId;
          return (
            <Link
              key={f.key}
              href={prequoteFilterHref('/dashboard/prequoted', { source: f.key }) as never}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
              aria-current={active ? 'page' : undefined}
            >
              {f.label}
            </Link>
          );
        })}
      </div>
      {lineRules.length > 0 ? (
        <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
          <span className="small text-body-secondary fw-semibold me-1">Known lines</span>
          {lineRules.map((rule) => {
            const active = callerLineId === rule.id;
            const n = lineCounts[rule.id] ?? 0;
            return (
              <Link
                key={rule.id}
                href={
                  prequoteFilterHref('/dashboard/prequoted', {
                    source,
                    line: active ? null : rule.id,
                  }) as never
                }
                className={`btn btn-sm ${active ? 'btn-warning' : 'btn-outline-warning'}`}
                aria-current={active ? 'page' : undefined}
                title={`Phone contains ${rule.digits} — auto-flagged thin for bulk dismiss`}
              >
                {rule.label} ({n})
              </Link>
            );
          })}
        </div>
      ) : null}
      <p className="small text-body-secondary mb-0 mt-2">
        Showing <strong>{counts.total}</strong> pre-quote ticket{counts.total === 1 ? '' : 's'}
        {counts.thin > 0 ? (
          <>
            {' '}
            · <strong>{counts.thin}</strong> flagged{' '}
            <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">
              Thin
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
