import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../AppContext';
import { Icon } from '../components/Icon';
import { LoanTable, NoLoans } from '../components/LoanTable';
import { draftFromMember, MemberFormModal } from '../components/MemberForm';
import { useToast } from '../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Notice,
  StatCard,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatPhone, titleCase } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { TIER_BORROW_LIMITS, type Checkout, type Member } from '../lib/types';

export function MemberDetail() {
  const { memberId = '' } = useParams();
  const { timezone, isAdmin, refreshCounts } = useSession();
  const toast = useToast();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const detail = useAsync<{ member: Member; items: Checkout[] }>(
    () => api.memberHistory(memberId),
    [memberId],
  );

  if (detail.loading) {
    return (
      <Card>
        <TableSkeleton rows={4} columns={3} />
      </Card>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <div className="stack">
        <Notice tone="danger">{detail.error?.message ?? 'This member could not be loaded.'}</Notice>
        <div>
          <Button icon="back" onClick={() => navigate('/members')}>
            Back to members
          </Button>
        </div>
      </div>
    );
  }

  const { member, items } = detail.data;
  const limit = member.borrowLimit ?? TIER_BORROW_LIMITS[member.tier] ?? 3;
  const openLoans = items.filter((loan) => loan.status === 'open');
  const past = items.filter((loan) => loan.status !== 'open');
  const expired =
    member.membershipExpiresAt && new Date(member.membershipExpiresAt) < new Date();

  function reload() {
    detail.reload();
    refreshCounts();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div className="col">
          <Link to="/members" className="small row" style={{ gap: 6, marginBottom: 6 }}>
            <Icon name="back" size={14} /> Members
          </Link>
          <div className="row">
            <Avatar name={member.name} large />
            <div className="col">
              <h1>{member.name}</h1>
              <p className="subtitle">
                {formatPhone(member.phone)}
                {member.email ? ` · ${member.email}` : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="btn-group">
          <Button onClick={() => setEditing(true)}>Edit</Button>
          {isAdmin ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
              <span className="hide-sm">Delete</span>
            </Button>
          ) : null}
        </div>
      </div>

      {member.status === 'suspended' ? (
        <Notice tone="danger">
          This membership is suspended, so new checkouts are blocked. Edit the member to lift it.
        </Notice>
      ) : null}
      {expired ? (
        <Notice tone="warning">
          Membership expired on {formatDate(member.membershipExpiresAt, timezone)}. Renew it before
          lending anything else.
        </Notice>
      ) : null}

      <div className="grid grid-stats">
        <StatCard
          label="Out now"
          value={`${member.openLoans} / ${limit}`}
          tone={member.openLoans >= limit ? 'warning' : 'neutral'}
          hint={titleCase(member.tier) + ' tier'}
        />
        <StatCard label="Lifetime loans" value={member.totalLoans} />
        <StatCard label="Member since" value={formatDate(member.createdAt, timezone).split(' ').slice(1).join(' ')} />
        <StatCard label="Phone" value={formatPhone(member.phone)} />
      </div>

      {member.notes ? (
        <Card title="Notes">
          <p className="small">{member.notes}</p>
        </Card>
      ) : null}

      <Card title={`Currently borrowed (${openLoans.length})`} bodyClassName="">
        <LoanTable
          loans={openLoans}
          onChanged={reload}
          showMember={false}
          empty={<NoLoans message={`${member.name} has nothing out at the moment.`} />}
        />
      </Card>

      <Card title="History" bodyClassName="">
        {past.length === 0 ? (
          <NoLoans message="No completed loans yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Taken</th>
                  <th>Returned</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {past.map((loan) => (
                  <tr key={loan.checkoutId}>
                    <td>
                      <Link to={`/assets/${loan.assetId}`} className="strong">
                        {loan.assetTitle}
                      </Link>
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
        )}
      </Card>

      {editing ? (
        <MemberFormModal
          title="Edit member"
          submitLabel="Save changes"
          editing
          initial={draftFromMember(member)}
          onClose={() => setEditing(false)}
          onSubmit={async (payload) => {
            await api.updateMember(member.memberId, payload);
            toast.success('Member updated.');
            detail.reload();
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this member?"
          destructive
          confirmLabel="Delete member"
          busy={busy}
          message={
            <>
              <strong>{member.name}</strong> will be removed from the register. Items they still
              have out must be checked in first.
            </>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.deleteMember(member.memberId);
              toast.success('Member deleted.');
              navigate('/members');
            } catch (error) {
              toast.failure(error);
              setBusy(false);
              setConfirmDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
