import { useState } from 'react';
import { ApiError } from '../lib/api';
import { TIER_BORROW_LIMITS, type Member } from '../lib/types';
import { Button, Modal, SelectField, TextArea, TextField } from './ui';

const TIERS = (Object.keys(TIER_BORROW_LIMITS) as Array<keyof typeof TIER_BORROW_LIMITS>).map(
  (tier) => ({
    value: tier,
    label: `${tier[0]!.toUpperCase()}${tier.slice(1)} — ${TIER_BORROW_LIMITS[tier]} items`,
  }),
);

export interface MemberDraft {
  name: string;
  phone: string;
  email: string;
  tier: string;
  borrowLimit: string;
  status: string;
  whatsappOptIn: boolean;
  membershipExpiresAt: string;
  notes: string;
}

export function emptyMemberDraft(): MemberDraft {
  return {
    name: '',
    phone: '',
    email: '',
    tier: 'standard',
    borrowLimit: '',
    status: 'active',
    whatsappOptIn: true,
    membershipExpiresAt: '',
    notes: '',
  };
}

export function draftFromMember(member: Member): MemberDraft {
  return {
    name: member.name,
    phone: member.phone,
    email: member.email ?? '',
    tier: member.tier,
    borrowLimit: member.borrowLimit === undefined ? '' : String(member.borrowLimit),
    status: member.status,
    whatsappOptIn: member.whatsappOptIn,
    membershipExpiresAt: member.membershipExpiresAt?.slice(0, 10) ?? '',
    notes: member.notes ?? '',
  };
}

export function MemberFormModal({
  title,
  initial,
  submitLabel,
  editing,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: MemberDraft;
  submitLabel: string;
  editing?: boolean;
  onClose: () => void;
  onSubmit: (payload: Partial<Member>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof MemberDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!draft.name.trim()) nextErrors.name = 'A name is required';
    if (!draft.phone.trim()) nextErrors.phone = 'A phone number is required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        tier: draft.tier,
        status: draft.status,
        whatsappOptIn: true,
      };
      if (draft.email.trim()) payload.email = draft.email.trim();
      if (draft.borrowLimit.trim()) payload.borrowLimit = Number(draft.borrowLimit);
      if (draft.membershipExpiresAt) {
        // Membership lapses at the end of the chosen day, not at midnight before it.
        payload.membershipExpiresAt = new Date(
          `${draft.membershipExpiresAt}T23:59:59Z`,
        ).toISOString();
      }
      if (draft.notes.trim()) payload.notes = draft.notes.trim();

      await onSubmit(payload as Partial<Member>);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors;
        setErrors(Object.keys(fieldErrors).length > 0 ? fieldErrors : { phone: error.message });
      } else {
        setErrors({ name: 'Could not save this member.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField
          label="Full name"
          value={draft.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="Ananya Sharma"
        />
        <TextField
          label="Mobile number"
          type="tel"
          value={draft.phone}
          onChange={set('phone')}
          error={errors.phone}
          hint="Reminders are sent here"
          placeholder="98765 43210"
        />
        <TextField
          label="Email (optional)"
          type="email"
          value={draft.email}
          onChange={set('email')}
          error={errors.email}
        />
        <SelectField
          label="Membership tier"
          value={draft.tier}
          onChange={set('tier')}
          options={TIERS}
        />
        <TextField
          label="Borrow limit override"
          type="number"
          min={0}
          value={draft.borrowLimit}
          onChange={set('borrowLimit')}
          hint="Leave blank to use the tier limit"
          error={errors.borrowLimit}
        />
        <TextField
          label="Membership valid until"
          type="date"
          value={draft.membershipExpiresAt}
          onChange={set('membershipExpiresAt')}
          hint="Optional"
        />
        {editing ? (
          <SelectField
            label="Status"
            value={draft.status}
            onChange={set('status')}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        ) : null}
        <TextArea
          label="Notes"
          wrapClassName="span-2"
          rows={3}
          value={draft.notes}
          onChange={set('notes')}
          placeholder="Anything the desk should know"
        />
      </div>
    </Modal>
  );
}
