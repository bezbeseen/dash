'use client';

export type SortDir = 'asc' | 'desc';

export function SortableTh<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  align = 'start',
  className = '',
}: {
  label: string;
  column: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  align?: 'start' | 'end';
  className?: string;
}) {
  const active = sortKey === column;
  const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : '';
  return (
    <th className={`${align === 'end' ? 'text-end' : ''} ${className}`.trim()} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="btn btn-link btn-sm p-0 text-reset text-decoration-none fw-semibold"
        onClick={() => onSort(column)}
      >
        {label}
        {arrow ? <span className="ms-1" aria-hidden>{arrow}</span> : null}
      </button>
    </th>
  );
}
