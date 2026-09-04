import type { ReactNode } from 'react';

export type NamedCount = { name: string; count: number };

export function formatMetricInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export function DeltaBadge({
  current,
  previous,
  lowerIsBetter = false,
}: {
  current: number;
  previous: number;
  lowerIsBetter?: boolean;
}) {
  if (previous <= 0) {
    return <span className="small text-body-secondary">no prior data</span>;
  }
  const change = (current - previous) / previous;
  const up = change >= 0;
  const flat = Math.abs(change) < 0.005;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={`small fw-semibold ${flat ? 'text-body-secondary' : good ? 'text-success' : 'text-danger'}`}>
      {flat ? '±0%' : `${up ? '+' : ''}${(change * 100).toFixed(1)}%`}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  current,
  previous,
  lowerIsBetter,
  hint,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  lowerIsBetter?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="card border rounded-3 h-100 bg-body shadow-sm">
      <div className="card-body">
        <p className="menu-label mb-1">{label}</p>
        <p className="h4 fw-semibold mb-1 tabular-nums">{value}</p>
        <DeltaBadge current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
        {hint ? <p className="small text-body-secondary mb-0 mt-1">{hint}</p> : null}
      </div>
    </div>
  );
}

export function BreakdownCard({
  title,
  rows,
  nameLabel,
  valueLabel,
  emptyText = 'No data in this range.',
}: {
  title: string;
  rows: readonly NamedCount[];
  nameLabel: string;
  valueLabel: string;
  emptyText?: string;
}) {
  return (
    <div className="card border rounded-3 overflow-hidden bg-body shadow-sm">
      <div className="card-body border-bottom py-3">
        <h2 className="h6 fw-semibold mb-0">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="card-body">
          <p className="small text-body-secondary mb-0">{emptyText}</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="ps-4">{nameLabel}</th>
                <th className="text-end pe-4" style={{ width: '8rem' }}>
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="ps-4 text-break">{row.name}</td>
                  <td className="text-end pe-4 fw-semibold tabular-nums">{formatMetricInt(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
