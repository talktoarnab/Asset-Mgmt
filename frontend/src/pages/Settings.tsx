import { useState } from 'react';
import { useSession } from '../AppContext';
import { useToast } from '../components/Toast';
import { Button, Card, Notice, SelectField, TextField } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Org } from '../lib/types';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

export function Settings() {
  const { org, isAdmin, refresh } = useSession();
  const toast = useToast();

  const [draft, setDraft] = useState(() => toDraft(org));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reconciling, setReconciling] = useState(false);

  const set = (key: keyof ReturnType<typeof toDraft>) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await api.updateSettings({
        name: draft.name.trim(),
        timezone: draft.timezone,
        defaultCountryCode: draft.defaultCountryCode.trim(),
        defaultLoanDays: Number(draft.defaultLoanDays),
        maxRenewals: Number(draft.maxRenewals),
        renewalDays: Number(draft.renewalDays),
      });
      toast.success('Branch settings saved.');
      refresh();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
      } else {
        toast.failure(error);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="stack">
        <div className="page-head">
          <h1>Settings</h1>
        </div>
        <Notice tone="info">
          Branch settings can only be changed by an administrator. Ask them to adjust loan periods
          for you.
        </Notice>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Loan rules for this branch.</p>
        </div>
        <Button variant="primary" loading={busy} onClick={save}>
          Save changes
        </Button>
      </div>

      <Card title="Branch">
        <div className="form-grid">
          <TextField
            label="Branch name"
            value={draft.name}
            onChange={set('name')}
            error={errors.name}
          />
          <SelectField
            label="Timezone"
            value={draft.timezone}
            onChange={set('timezone')}
            hint="Due dates land at the end of the day here"
            options={[...new Set([org.timezone, ...TIMEZONES])].map((zone) => ({
              value: zone,
              label: zone.replace('_', ' '),
            }))}
          />
          <TextField
            label="Default country code"
            value={draft.defaultCountryCode}
            onChange={set('defaultCountryCode')}
            hint="Applied to phone numbers typed without one"
            placeholder="+91"
            error={errors.defaultCountryCode}
          />
        </div>
      </Card>

      <Card title="Lending rules">
        <div className="form-grid">
          <TextField
            label="Loan period (days)"
            type="number"
            min={1}
            value={draft.defaultLoanDays}
            onChange={set('defaultLoanDays')}
            error={errors.defaultLoanDays}
          />
          <TextField
            label="Renewals allowed"
            type="number"
            min={0}
            value={draft.maxRenewals}
            onChange={set('maxRenewals')}
            error={errors.maxRenewals}
          />
          <TextField
            label="Days added per renewal"
            type="number"
            min={1}
            value={draft.renewalDays}
            onChange={set('renewalDays')}
            error={errors.renewalDays}
          />
        </div>
      </Card>

      <Card title="Maintenance">
        <p className="small muted" style={{ marginBottom: 12 }}>
          Each member carries a counter of how many items they currently hold, which is what
          enforces borrowing limits. If records were edited outside the app, recount it from the
          loans themselves.
        </p>
        <Button
          loading={reconciling}
          onClick={async () => {
            setReconciling(true);
            try {
              const result = await api.reconcile();
              toast.success(
                result.repaired === 0
                  ? `All ${result.checked} member records already agree.`
                  : `Repaired ${result.repaired} of ${result.checked} member records.`,
              );
            } catch (error) {
              toast.failure(error);
            } finally {
              setReconciling(false);
            }
          }}
        >
          Recount open loans
        </Button>
      </Card>
    </div>
  );
}

function toDraft(org: Org) {
  return {
    name: org.name,
    timezone: org.timezone,
    defaultCountryCode: org.defaultCountryCode,
    defaultLoanDays: String(org.defaultLoanDays),
    maxRenewals: String(org.maxRenewals),
    renewalDays: String(org.renewalDays),
  };
}
