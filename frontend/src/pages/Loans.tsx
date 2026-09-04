import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../AppContext';
import { LoanTable, NoLoans } from '../components/LoanTable';
import { Badge, Button, Card, SearchInput, Segmented, TableSkeleton } from '../components/ui';
import { api } from '../lib/api';
import { dueLabel, formatDate, titleCase } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Checkout } from '../lib/types';

type View = 'overdue' | 'open' | 'history';

export function Loans() {
  const { timezone, refreshCounts } = useSession();
  const [view, setView] = useState<View>('overdue');
  const [query, setQuery] = useState('');

  const open = useAsync<Checkout[]>(
    () => api.listCheckouts('open').then((response) => response.items),
    [],
  );
  const history = useAsync<Checkout[]>(
    () => api.listCheckouts('recent', 200).then((response) => response.items),
    [],
  );

  function reload() {
    open.reload();
    history.reload();
    refreshCounts();
  }

  const term = query.trim().toLowerCase();
  const matches = (loan: Checkout) =>
    !term ||
    loan.assetTitle.toLowerCase().includes(term) ||
    loan.memberName.toLowerCase().includes(term) ||
    loan.assetCode.toLowerCase().includes(term);

  const openLoans = (open.data ?? []).filter(matches);
  const overdueLoans = openLoans.filter((loan) => dueLabel(loan.dueAt, timezone).overdue);
  const closed = (history.data ?? []).filter((loan) => loan.status !== 'open').filter(matches);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Loans</h1>
          <p className="subtitle">
            {overdueLoans.length > 0
              ? `${overdueLoans.length} item${overdueLoans.length === 1 ? '' : 's'} need chasing.`
              : 'Every borrowed item is within its loan period.'}
          </p>
        </div>
        <Button icon="refresh" onClick={reload}>
          Refresh
        </Button>
      </div>

      <div className="row wrap">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'overdue', label: `Overdue (${overdueLoans.length})` },
            { value: 'open', label: `On loan (${openLoans.length})` },
            { value: 'history', label: 'Returned' },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Filter by item or borrower" />
      </div>

      <Card bodyClassName="">
        {view === 'history' ? (
          history.loading ? (
            <TableSkeleton />
          ) : (
            <HistoryTable loans={closed} />
          )
        ) : open.loading ? (
          <TableSkeleton />
        ) : (
          <LoanTable
            loans={view === 'overdue' ? overdueLoans : openLoans}
            onChanged={reload}
            empty={
              <NoLoans
                message={
                  view === 'overdue'
                    ? 'No overdue items right now.'
                    : 'Nothing is on loan at the moment.'
                }
              />
            }
          />
        )}
      </Card>
    </div>
  );
}

function HistoryTable({ loans }: { loans: Checkout[] }) {
  const { timezone } = useSession();

  if (loans.length === 0) {
    return <NoLoans message="No completed loans yet." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Borrower</th>
            <th>Taken</th>
            <th>Returned</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.checkoutId}>
              <td>
                <div className="col">
                  <Link to={`/assets/${loan.assetId}`} className="strong">
                    {loan.assetTitle}
                  </Link>
                  <span className="mono muted">{loan.assetCode}</span>
                </div>
              </td>
              <td>
                <Link to={`/members/${loan.memberId}`}>{loan.memberName}</Link>
              </td>
              <td className="small muted">{formatDate(loan.checkedOutAt, timezone)}</td>
              <td className="small muted">{formatDate(loan.returnedAt, timezone)}</td>
              <td>
                <Badge tone={loan.status === 'returned' ? 'positive' : 'danger'} dot>
                  {titleCase(loan.status)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
