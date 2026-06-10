import Link from 'next/link';
import {
  PREQUOTE_SOURCE_FILTERS,
  prequoteFilterHref,
  type PrequoteSourceFilter,
} from '@/lib/domain/prequote-triage';

type Props = {
  source: PrequoteSourceFilter;
  counts: { total: number; thin: number };
};

export function PrequoteBoardFilters({ source, counts }: Props) {
  return (
    <div className="prequote-board-toolbar px-3 px-md-4 pb-3">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="small text-body-secondary fw-semibold me-1">Source</span>
        {PREQUOTE_SOURCE_FILTERS.map((f) => {
          const active = source === f.key;
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
      <p className="small text-body-secondary mb-0 mt-2">
        Showing <strong>{counts.total}</strong> pre-quote ticket{counts.total === 1 ? '' : 's'}
        {counts.thin > 0 ? (
          <>
            {' '}
            · <strong>{counts.thin}</strong> flagged <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Thin</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
