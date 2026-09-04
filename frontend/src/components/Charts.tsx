interface ActivityPoint {
  date: string;
  checkouts: number;
  returns: number;
}

/**
 * Deliberately plain CSS bars rather than a charting library: the shapes are
 * simple, and the whole reports page stays under a few kilobytes on a phone
 * connection.
 */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const peak = Math.max(1, ...data.map((point) => Math.max(point.checkouts, point.returns)));

  return (
    <div>
      <div className="bars">
        {data.map((point) => (
          <div
            className="bar-col"
            key={point.date}
            title={`${point.date}: ${point.checkouts} out, ${point.returns} back`}
          >
            <div
              className="bar"
              style={{ height: `${(point.checkouts / peak) * 100}%` }}
              aria-hidden="true"
            />
            <div
              className="bar returns"
              style={{ height: `${(point.returns / peak) * 100}%` }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
      <div className="row-between" style={{ marginTop: 10 }}>
        <span className="tiny muted">{formatDay(data[0]?.date)}</span>
        <div className="legend">
          <span>
            <span className="swatch" style={{ background: 'var(--brand)' }} />
            Checked out
          </span>
          <span>
            <span className="swatch" style={{ background: '#a7d9d1' }} />
            Returned
          </span>
        </div>
        <span className="tiny muted">{formatDay(data.at(-1)?.date)}</span>
      </div>
    </div>
  );
}

function formatDay(date: string | undefined): string {
  if (!date) return '';
  const [, month, day] = date.split('-');
  return `${day} ${
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
      Number(month) - 1
    ] ?? ''
  }`;
}

export function RankedBars({
  rows,
}: {
  rows: Array<{ id: string; label: string; sublabel?: string; value: number }>;
}) {
  const peak = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div>
      {rows.map((row) => (
        <div className="hbar-row" key={row.id}>
          <div className="col">
            <span className="small truncate" title={row.label}>
              {row.label}
            </span>
            {row.sublabel ? <span className="tiny muted">{row.sublabel}</span> : null}
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(row.value / peak) * 100}%` }} />
          </div>
          <span className="small strong">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
