import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../AppContext';
import { LoanTable, NoLoans } from '../components/LoanTable';
import { Button, Card, EmptyState, StatCard, TableSkeleton } from '../components/ui';
import { api } from '../lib/api';
import { dueLabel, formatDate } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Checkout, Summary } from '../lib/types';

export function Dashboard() {
  const { org, timezone, refreshCounts } = useSession();
  const navigate = useNavigate();

  const summary = useAsync<Summary>(() => api.summary(), []);
  const loans = useAsync<Checkout[]>(
    () => api.listCheckouts('open').then((response) => response.items),
    [],
  );

  function reload() {
    summary.reload();
    loans.reload();
    refreshCounts();
  }

  const open = loans.data ?? [];
  const overdue = open.filter((loan) => dueLabel(loan.dueAt, timezone).overdue);
  const dueSoon = open.filter((loan) => {
    const label = dueLabel(loan.dueAt, timezone);
    return !label.overdue && label.days <= 2;
  });

  const stats = summary.data;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{greeting()}</h1>
          <p className="subtitle">
            {stats
              ? `${stats.loans.open} item${stats.loans.open === 1 ? '' : 's'} out on loan across ${
                  stats.assets.total
                } catalogued item${stats.assets.total === 1 ? '' : 's'}.`
              : 'Loading today’s position…'}
          </p>
        </div>
        <div className="btn-group">
          <Button icon="refresh" onClick={reload}>
            <span className="hide-sm">Refresh</span>
          </Button>
          <Button variant="primary" icon="scan" onClick={() => navigate('/scan')}>
            Open desk
          </Button>
        </div>
      </div>

      <div className="grid grid-stats">
        <StatCard
          label="Overdue"
          icon="alert"
          tone={stats && stats.loans.overdue > 0 ? 'danger' : 'neutral'}
          value={stats?.loans.overdue ?? '—'}
          hint={
            stats?.loans.overdue
              ? 'Needs a nudge today'
              : stats
                ? 'Everything is on time'
                : undefined
          }
        />
        <StatCard
          label="Due today"
          icon="clock"
          tone={stats && stats.loans.dueToday > 0 ? 'warning' : 'neutral'}
          value={stats?.loans.dueToday ?? '—'}
          hint={stats ? `${stats.loans.dueSoon} more in the next 3 days` : undefined}
        />
        <StatCard
          label="Out on loan"
          icon="loans"
          value={stats?.loans.open ?? '—'}
          hint={stats ? `${stats.assets.utilisationPct}% of the catalogue` : undefined}
        />
        <StatCard
          label="Available now"
          icon="box"
          tone="positive"
          value={stats?.assets.available ?? '—'}
          hint={stats ? `${stats.members.active} active members` : undefined}
        />
      </div>

      <Card
        title={`Overdue${overdue.length ? ` (${overdue.length})` : ''}`}
        actions={
          overdue.length > 0 ? (
            <Link to="/loans" className="small">
              View all loans
            </Link>
          ) : null
        }
        bodyClassName=""
      >
        {loans.loading ? (
          <TableSkeleton />
        ) : (
          <LoanTable
            loans={overdue.slice(0, 8)}
            onChanged={reload}
            empty={
              <NoLoans message="No overdue items. Chase returns from the loans list when something is late." />
            }
          />
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="Due in the next couple of days" bodyClassName="">
          {loans.loading ? (
            <TableSkeleton rows={3} columns={2} />
          ) : dueSoon.length === 0 ? (
            <EmptyState
              icon="clock"
              title="Nothing due imminently"
              description="These loans are due within two days."
            />
          ) : (
            <div style={{ padding: '6px 18px 14px' }}>
              {dueSoon.slice(0, 6).map((loan) => (
                <div
                  key={loan.checkoutId}
                  className="row-between"
                  style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}
                >
                  <div className="col grow">
                    <Link to={`/assets/${loan.assetId}`} className="small strong truncate">
                      {loan.assetTitle}
                    </Link>
                    <span className="tiny muted truncate">
                      {loan.memberName} · {formatDate(loan.dueAt, timezone)}
                    </span>
                  </div>
                  <span className="badge warning">{dueLabel(loan.dueAt, timezone).text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="This branch">
          <div className="stack" style={{ gap: 12 }}>
            <Row label="Loan period" value={`${org.defaultLoanDays} days`} />
            <Row
              label="Renewals allowed"
              value={org.maxRenewals === 0 ? 'None' : `${org.maxRenewals} × ${org.renewalDays} days`}
            />
            <Row label="Timezone" value={org.timezone} />
            <Row
              label="Checkouts (30 days)"
              value={stats ? String(stats.loans.checkoutsLast30Days) : '—'}
            />
            <Row
              label="Reported lost"
              value={stats ? `${stats.shrinkage.lostAssets} item(s)` : '—'}
            />
            <div className="btn-group" style={{ marginTop: 4 }}>
              <Button size="sm" onClick={() => navigate('/assets/labels')} icon="print">
                Print labels
              </Button>
              <Button size="sm" onClick={() => navigate('/reports')} icon="reports">
                Full report
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-between small">
      <span className="muted">{label}</span>
      <span className="strong">{value}</span>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
