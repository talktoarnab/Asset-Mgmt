import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../AppContext';
import { api } from '../lib/api';
import { dueLabel, formatDate, formatPhone } from '../lib/format';
import type { Checkout } from '../lib/types';
import { Badge, Button, ConfirmDialog, EmptyState } from './ui';
import { useToast } from './Toast';

type Action = 'checkin' | 'renew' | 'lost';

export function LoanTable({
  loans,
  onChanged,
  empty,
  showMember = true,
  showItem = true,
}: {
  loans: Checkout[];
  onChanged: () => void;
  empty: ReactNode;
  showMember?: boolean;
  showItem?: boolean;
}) {
  const { timezone, isAdmin } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();
  const [confirmLost, setConfirmLost] = useState<Checkout>();

  if (loans.length === 0) return <>{empty}</>;

  async function run(loan: Checkout, action: Action) {
    setBusy(`${loan.checkoutId}:${action}`);
    try {
      if (action === 'checkin') {
        await api.checkin(loan.checkoutId);
        toast.success(`"${loan.assetTitle}" is back on the shelf.`);
      } else if (action === 'renew') {
        const renewed = await api.renew(loan.checkoutId);
        toast.success(`Renewed until ${formatDate(renewed.dueAt, timezone)}.`);
      } else {
        await api.markLost(loan.checkoutId);
        toast.success(`"${loan.assetTitle}" recorded as lost.`);
      }
      onChanged();
    } catch (error) {
      toast.failure(error);
    } finally {
      setBusy(undefined);
      setConfirmLost(undefined);
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {showItem ? <th>Item</th> : null}
              {showMember ? <th>Borrower</th> : null}
              <th>Due</th>
              <th className="hide-sm">Taken</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((loan) => {
              const due = dueLabel(loan.dueAt, timezone);
              return (
                <tr key={loan.checkoutId}>
                  {showItem ? (
                    <td>
                      <div className="col">
                        <Link to={`/assets/${loan.assetId}`} className="strong">
                          {loan.assetTitle}
                        </Link>
                        <span className="mono muted">{loan.assetCode}</span>
                      </div>
                    </td>
                  ) : null}
                  {showMember ? (
                    <td>
                      <div className="col">
                        <Link to={`/members/${loan.memberId}`}>{loan.memberName}</Link>
                        <span className="tiny muted">{formatPhone(loan.memberPhone)}</span>
                      </div>
                    </td>
                  ) : null}
                  <td>
                    <div className="col">
                      <Badge tone={due.tone} dot>
                        {due.text}
                      </Badge>
                      <span className="tiny muted">{formatDate(loan.dueAt, timezone)}</span>
                    </div>
                  </td>
                  <td className="hide-sm small muted">
                    {formatDate(loan.checkedOutAt, timezone)}
                    {loan.renewals > 0 ? ` · renewed ${loan.renewals}×` : ''}
                  </td>
                  <td className="right">
                    <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy === `${loan.checkoutId}:checkin`}
                        onClick={() => run(loan, 'checkin')}
                      >
                        Check in
                      </Button>
                      <Button
                        size="sm"
                        loading={busy === `${loan.checkoutId}:renew`}
                        onClick={() => run(loan, 'renew')}
                      >
                        Renew
                      </Button>
                      {isAdmin && due.overdue ? (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmLost(loan)}>
                          Lost
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmLost ? (
        <ConfirmDialog
          title="Mark this item as lost?"
          destructive
          confirmLabel="Mark as lost"
          busy={busy === `${confirmLost.checkoutId}:lost`}
          message={
            <>
              <p>
                <strong>{confirmLost.assetTitle}</strong> will be removed from circulation and
                counted in shrinkage reports. The loan against {confirmLost.memberName} will be
                closed.
              </p>
              <p style={{ marginTop: 10 }} className="muted">
                You can put the item back into circulation later by editing it in the catalogue.
              </p>
            </>
          }
          onCancel={() => setConfirmLost(undefined)}
          onConfirm={() => run(confirmLost, 'lost')}
        />
      ) : null}
    </>
  );
}

export function NoLoans({ message }: { message: string }) {
  return <EmptyState icon="check" title="Nothing here" description={message} />;
}
