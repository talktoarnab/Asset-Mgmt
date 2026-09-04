import { Link } from 'react-router-dom';
import { useSession } from '../AppContext';
import { ActivityChart, RankedBars } from '../components/Charts';
import { Button, Card, EmptyState, Notice, StatCard, TableSkeleton } from '../components/ui';
import { api } from '../lib/api';
import { currency, titleCase } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Report } from '../lib/types';

export function Reports() {
  const { org } = useSession();
  const report = useAsync<Report>(() => api.report(), []);

  if (report.loading) {
    return (
      <Card>
        <TableSkeleton rows={6} columns={3} />
      </Card>
    );
  }

  if (report.error || !report.data) {
    return <Notice tone="danger">{report.error?.message ?? 'The report could not be built.'}</Notice>;
  }

  const data = report.data;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="subtitle">
            Circulation and shrinkage for {org.name}, in {org.timezone.replace('_', ' ')}.
          </p>
        </div>
        <div className="btn-group">
          <Button icon="refresh" onClick={report.reload}>
            Refresh
          </Button>
          <Button icon="print" onClick={() => window.print()}>
            <span className="hide-sm">Print</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-stats">
        <StatCard
          label="Utilisation"
          value={`${data.assets.utilisationPct}%`}
          hint={`${data.assets.checkedOut} of ${data.assets.total} items out`}
        />
        <StatCard
          label="Checkouts (30 days)"
          value={data.loans.checkoutsLast30Days}
          hint={`${data.loans.returnedLast30Days} returned`}
        />
        <StatCard
          label="Overdue"
          tone={data.loans.overdue > 0 ? 'danger' : 'positive'}
          value={data.loans.overdue}
          hint={`${data.shrinkage.longOverdue} over 30 days late`}
        />
        <StatCard
          label="Value at risk"
          tone={data.shrinkage.valueAtRisk > 0 ? 'warning' : 'neutral'}
          value={currency(data.shrinkage.valueAtRisk)}
          hint={`${data.shrinkage.lostAssets} item(s) written off`}
        />
      </div>

      <Card title="Activity over the last 30 days">
        <ActivityChart data={data.activityByDay} />
      </Card>

      <div className="grid grid-2">
        <Card title="Most borrowed">
          {data.mostBorrowed.length === 0 ? (
            <EmptyState title="No loans yet" description="Circulation appears here once items start moving." />
          ) : (
            <RankedBars
              rows={data.mostBorrowed.map((item) => ({
                id: item.assetId,
                label: item.title,
                sublabel: item.code,
                value: item.timesBorrowed,
              }))}
            />
          )}
        </Card>

        <Card title="Most active members">
          {data.topBorrowers.length === 0 ? (
            <EmptyState title="No borrowers yet" description="Member activity appears here." />
          ) : (
            <RankedBars
              rows={data.topBorrowers.map((member) => ({
                id: member.memberId,
                label: member.name,
                sublabel: `${member.openLoans} out now`,
                value: member.totalLoans,
              }))}
            />
          )}
        </Card>

        <Card title="Catalogue by category" bodyClassName="">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="right">Items</th>
                  <th className="right">Out now</th>
                  <th className="right">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((row) => (
                  <tr key={row.category}>
                    <td className="strong">{titleCase(row.category)}</td>
                    <td className="right">{row.total}</td>
                    <td className="right">{row.checkedOut}</td>
                    <td className="right muted">
                      {row.total === 0 ? '—' : `${Math.round((row.checkedOut / row.total) * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Never borrowed"
          actions={<span className="tiny muted">{data.neverBorrowed.length} shown</span>}
          bodyClassName=""
        >
          {data.neverBorrowed.length === 0 ? (
            <EmptyState
              icon="check"
              title="Everything has circulated"
              description="Every item in the catalogue has been borrowed at least once."
            />
          ) : (
            <div style={{ padding: '10px 18px' }}>
              {data.neverBorrowed.map((item) => (
                <div
                  key={item.assetId}
                  className="row-between"
                  style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
                >
                  <Link to={`/assets/${item.assetId}`} className="small truncate">
                    {item.title}
                  </Link>
                  <span className="mono muted">{item.code}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
