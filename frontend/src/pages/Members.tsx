import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { emptyMemberDraft, MemberFormModal } from '../components/MemberForm';
import { useToast } from '../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { formatPhone, titleCase } from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import { TIER_BORROW_LIMITS, type Member } from '../lib/types';

export function Members() {
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const debouncedQuery = useDebounced(query);
  const members = useAsync<Member[]>(
    () => api.listMembers(debouncedQuery || undefined).then((response) => response.items),
    [debouncedQuery],
  );

  const items = members.data ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p className="subtitle">
            {members.data
              ? `${items.length} member${items.length === 1 ? '' : 's'} registered.`
              : 'Loading the register…'}
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
          Add member
        </Button>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search by name, phone or email" />

      <Card bodyClassName="">
        {members.loading ? (
          <TableSkeleton columns={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="members"
            title={query ? 'No members match your search' : 'No members yet'}
            description={
              query
                ? 'Try part of a name or the last few digits of a phone number.'
                : 'Add the people who borrow from you so items can be signed out to them.'
            }
            action={
              query ? null : (
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  Add the first member
                </Button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="hide-sm">Tier</th>
                  <th>Out now</th>
                  <th className="hide-sm right">Lifetime loans</th>
                </tr>
              </thead>
              <tbody>
                {items.map((member) => {
                  const limit = member.borrowLimit ?? TIER_BORROW_LIMITS[member.tier] ?? 3;
                  const atLimit = member.openLoans >= limit;
                  return (
                    <tr
                      key={member.memberId}
                      className="clickable"
                      onClick={() => navigate(`/members/${member.memberId}`)}
                    >
                      <td>
                        <div className="row">
                          <Avatar name={member.name} />
                          <div className="col">
                            <Link to={`/members/${member.memberId}`} className="strong">
                              {member.name}
                            </Link>
                            <span className="tiny muted">{formatPhone(member.phone)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hide-sm">
                        <Badge tone={member.status === 'suspended' ? 'danger' : 'neutral'}>
                          {member.status === 'suspended' ? 'Suspended' : titleCase(member.tier)}
                        </Badge>
                      </td>
                      <td>
                        <span className={`small ${atLimit ? 'strong' : ''}`}>
                          {member.openLoans} / {limit}
                        </span>
                        {atLimit && member.openLoans > 0 ? (
                          <div className="tiny muted">At limit</div>
                        ) : null}
                      </td>
                      <td className="hide-sm right small muted">{member.totalLoans}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding ? (
        <MemberFormModal
          title="Add a member"
          submitLabel="Add member"
          initial={emptyMemberDraft()}
          onClose={() => setAdding(false)}
          onSubmit={async (payload) => {
            const member = await api.createMember(payload);
            toast.success(`${member.name} added.`);
            members.reload();
          }}
        />
      ) : null}
    </div>
  );
}
