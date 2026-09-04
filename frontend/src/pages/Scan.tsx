/**
 * Desk checkout. Camera scanning is off for now; a USB/Bluetooth handheld
 * scanner acts as a keyboard wedge — it types the barcode into the focused
 * field and presses Enter. The same `/v1/scan` lookup will serve a camera
 * later without changing checkout or check-in.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../AppContext';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { Avatar, Badge, Button, Card, Notice, SearchInput, SelectField } from '../components/ui';
import { api } from '../lib/api';
import { dueLabel, formatDate, formatPhone, titleCase } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Member, ScanResult } from '../lib/types';

export function Scan() {
  const { org, timezone, refreshCounts } = useSession();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [manualRef, setManualRef] = useState('');
  const [result, setResult] = useState<ScanResult>();
  const [looking, setLooking] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberId, setMemberId] = useState<string>();
  const [loanDays, setLoanDays] = useState(String(org.defaultLoanDays));
  const [working, setWorking] = useState(false);

  const members = useAsync<Member[]>(
    () => api.listMembers().then((response) => response.items),
    [],
  );

  const lookup = useCallback(
    async (ref: string, withMember?: string) => {
      if (!ref.trim()) return;
      setLooking(true);
      try {
        const scan = await api.scan(ref.trim(), withMember);
        setResult(scan);
        if (scan.suggestedAction === 'checkin') setMemberId(undefined);
      } catch (error) {
        setResult(undefined);
        toast.failure(error);
      } finally {
        setLooking(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!result) inputRef.current?.focus();
  }, [result]);

  async function doCheckout() {
    if (!result || !memberId) return;
    setWorking(true);
    try {
      const response = await api.checkout({
        assetRef: result.asset.assetId,
        memberId,
        loanDays: Number(loanDays) || undefined,
      });
      toast.success(
        `${response.asset.title} → ${response.member.name}, due ${formatDate(
          response.checkout.dueAt,
          timezone,
        )}.`,
      );
      resetForNextScan();
    } catch (error) {
      toast.failure(error);
      void lookup(result.asset.assetId, memberId);
    } finally {
      setWorking(false);
    }
  }

  async function doCheckin() {
    if (!result) return;
    setWorking(true);
    try {
      const response = await api.checkinByRef(result.asset.assetId);
      toast.success(`"${response.asset.title}" checked in. Thanks!`);
      resetForNextScan();
    } catch (error) {
      toast.failure(error);
    } finally {
      setWorking(false);
    }
  }

  function resetForNextScan() {
    setResult(undefined);
    setManualRef('');
    setMemberId(undefined);
    setMemberQuery('');
    refreshCounts();
  }

  const filteredMembers = filterMembers(members.data ?? [], memberQuery);
  const selectedMember = (members.data ?? []).find((member) => member.memberId === memberId);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Desk</h1>
          <p className="subtitle">
            Scan with a handheld reader, or type the code printed on the label, then lend or return.
          </p>
        </div>
        {result ? (
          <Button icon="close" onClick={resetForNextScan}>
            Start over
          </Button>
        ) : null}
      </div>

      <div className="scan-layout">
        <Card bodyClassName="card-body">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void lookup(manualRef);
            }}
          >
            <div className="field">
              <label htmlFor="manual-code">Scan or type a label code</label>
              <div className="row">
                <input
                  ref={inputRef}
                  id="manual-code"
                  className="grow scanner-wedge"
                  value={manualRef}
                  onChange={(event) => setManualRef(event.target.value)}
                  placeholder="Ready for handheld scanner"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoFocus
                  spellCheck={false}
                />
                <Button type="submit" loading={looking} disabled={!manualRef.trim()}>
                  Find
                </Button>
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Handheld scanners send the barcode and Enter. Camera scanning can be added later on
                this same screen.
              </p>
            </div>
          </form>
        </Card>

        <div className="stack">
          {!result ? (
            <Card>
              <div className="empty" style={{ padding: '32px 16px' }}>
                <Icon name="scan" size={28} />
                <div className="empty-title">Waiting for a scan</div>
                <p className="small">
                  Point the handheld at a printed label. The item and its loan status appear here so
                  you can check it out or take it back in one tap.
                </p>
              </div>
            </Card>
          ) : (
            <>
              <Card bodyClassName="card-body">
                <div className="step done">
                  <span className="n">
                    <Icon name="check" size={12} />
                  </span>
                  Item
                </div>
                <div className="row-between" style={{ marginTop: 12, alignItems: 'flex-start' }}>
                  <div className="col grow">
                    <Link to={`/assets/${result.asset.assetId}`}>
                      <h2>{result.asset.title}</h2>
                    </Link>
                    <span className="small muted">
                      {[result.asset.creator, titleCase(result.asset.category), result.asset.location]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="mono muted" style={{ marginTop: 4 }}>
                      {result.asset.code}
                    </span>
                  </div>
                  <Badge tone={result.asset.status === 'available' ? 'positive' : 'info'} dot>
                    {titleCase(result.asset.status)}
                  </Badge>
                </div>
              </Card>

              {result.activeCheckout ? (
                <Card title="Currently on loan">
                  <div className="picked">
                    <Avatar name={result.activeCheckout.memberName} />
                    <div className="col grow">
                      <Link
                        to={`/members/${result.activeCheckout.memberId}`}
                        className="small strong"
                      >
                        {result.activeCheckout.memberName}
                      </Link>
                      <span className="tiny muted">
                        {formatPhone(result.activeCheckout.memberPhone)} · taken{' '}
                        {formatDate(result.activeCheckout.checkedOutAt, timezone)}
                      </span>
                    </div>
                    <Badge tone={dueLabel(result.activeCheckout.dueAt, timezone).tone} dot>
                      {dueLabel(result.activeCheckout.dueAt, timezone).text}
                    </Badge>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    style={{ marginTop: 14 }}
                    loading={working}
                    onClick={doCheckin}
                  >
                    Check this item back in
                  </Button>
                </Card>
              ) : (
                <Card>
                  <div className={`step ${memberId ? 'done' : ''}`}>
                    <span className="n">{memberId ? <Icon name="check" size={12} /> : '2'}</span>
                    Who is borrowing?
                  </div>

                  {selectedMember ? (
                    <div className="picked" style={{ marginTop: 12 }}>
                      <Avatar name={selectedMember.name} />
                      <div className="col grow">
                        <span className="small strong">{selectedMember.name}</span>
                        <span className="tiny muted">
                          {formatPhone(selectedMember.phone)} · {selectedMember.openLoans} item(s)
                          out
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setMemberId(undefined)}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <SearchInput
                        value={memberQuery}
                        onChange={setMemberQuery}
                        placeholder="Search by name or phone"
                      />
                      <div className="member-list" style={{ marginTop: 8 }}>
                        {filteredMembers.length === 0 ? (
                          <p className="small muted" style={{ padding: '10px 4px' }}>
                            No members match “{memberQuery}”.{' '}
                            <Link to="/members">Add a member</Link>
                          </p>
                        ) : (
                          filteredMembers.slice(0, 30).map((member) => (
                            <button
                              key={member.memberId}
                              className="member-option"
                              onClick={() => {
                                setMemberId(member.memberId);
                                void lookup(result.asset.assetId, member.memberId);
                              }}
                            >
                              <Avatar name={member.name} />
                              <div className="col grow">
                                <span className="small strong truncate">{member.name}</span>
                                <span className="tiny muted">
                                  {formatPhone(member.phone)} · {member.openLoans} out
                                </span>
                              </div>
                              <Badge tone={member.status === 'active' ? 'neutral' : 'danger'}>
                                {titleCase(member.tier)}
                              </Badge>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {result.blockers.length > 0 ? (
                    <div className="stack" style={{ gap: 8, marginTop: 14 }}>
                      {result.blockers.map((blocker) => (
                        <Notice key={blocker.code} tone="danger">
                          {blocker.message}
                        </Notice>
                      ))}
                    </div>
                  ) : null}

                  {memberId ? (
                    <div style={{ marginTop: 14 }} className="stack">
                      <SelectField
                        label="Loan period"
                        value={loanDays}
                        onChange={(event) => setLoanDays(event.target.value)}
                        options={loanOptions(org.defaultLoanDays)}
                      />
                      <Button
                        variant="primary"
                        size="lg"
                        block
                        loading={working}
                        disabled={result.blockers.length > 0}
                        onClick={doCheckout}
                      >
                        Check out to {selectedMember?.name.split(' ')[0]}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function filterMembers(members: Member[], query: string): Member[] {
  const term = query.trim().toLowerCase();
  if (!term) return members;
  const digits = term.replace(/\D/g, '');
  return members.filter(
    (member) =>
      member.name.toLowerCase().includes(term) ||
      (digits.length >= 3 && member.phone.includes(digits)) ||
      (member.email ?? '').toLowerCase().includes(term),
  );
}

function loanOptions(defaultDays: number): Array<{ value: string; label: string }> {
  const days = [...new Set([1, 3, 7, 14, 21, 30, defaultDays])].sort((a, b) => a - b);
  return days.map((value) => ({
    value: String(value),
    label: `${value} day${value === 1 ? '' : 's'}${value === defaultDays ? ' (branch default)' : ''}`,
  }));
}
