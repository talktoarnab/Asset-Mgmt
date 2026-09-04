import { useState } from 'react';
import { ApiError } from '../lib/api';
import type { Asset } from '../lib/types';
import { Button, Modal, SelectField, TextArea, TextField } from './ui';

const CATEGORIES = [
  { value: 'book', label: 'Book' },
  { value: 'tool', label: 'Tool' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'device', label: 'Device' },
  { value: 'media', label: 'Media' },
  { value: 'other', label: 'Other' },
];

const STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'maintenance', label: 'In maintenance' },
  { value: 'lost', label: 'Lost' },
  { value: 'retired', label: 'Retired' },
];

export interface AssetDraft {
  title: string;
  category: string;
  creator: string;
  identifier: string;
  location: string;
  replacementCost: string;
  status: string;
  code: string;
}

export function emptyDraft(): AssetDraft {
  return {
    title: '',
    category: 'book',
    creator: '',
    identifier: '',
    location: '',
    replacementCost: '',
    status: 'available',
    code: '',
  };
}

export function draftFromAsset(asset: Asset): AssetDraft {
  return {
    title: asset.title,
    category: asset.category,
    creator: asset.creator ?? '',
    identifier: asset.identifier ?? '',
    location: asset.location ?? '',
    replacementCost: asset.replacementCost === undefined ? '' : String(asset.replacementCost),
    status: asset.status === 'checked_out' ? 'available' : asset.status,
    code: asset.code,
  };
}

/** Empty strings are dropped so a blank optional field clears rather than stores "". */
export function draftToPayload(draft: AssetDraft, includeStatus: boolean): Partial<Asset> {
  const payload: Record<string, unknown> = {
    title: draft.title.trim(),
    category: draft.category,
  };
  if (draft.creator.trim()) payload.creator = draft.creator.trim();
  if (draft.identifier.trim()) payload.identifier = draft.identifier.trim();
  if (draft.location.trim()) payload.location = draft.location.trim();
  if (draft.replacementCost.trim()) payload.replacementCost = Number(draft.replacementCost);
  if (draft.code.trim()) payload.code = draft.code.trim().toUpperCase();
  if (includeStatus) payload.status = draft.status;
  return payload as Partial<Asset>;
}

export function AssetFormModal({
  title,
  initial,
  submitLabel,
  editing,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: AssetDraft;
  submitLabel: string;
  editing?: boolean;
  onClose: () => void;
  onSubmit: (payload: Partial<Asset>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof AssetDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    if (!draft.title.trim()) {
      setErrors({ title: 'Give the item a title' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await onSubmit(draftToPayload(draft, Boolean(editing)));
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors;
        setErrors(
          Object.keys(fieldErrors).length > 0 ? fieldErrors : { title: error.message },
        );
      } else {
        setErrors({ title: 'Could not save this item.' });
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
          label="Title"
          wrapClassName="span-2"
          value={draft.title}
          onChange={set('title')}
          error={errors.title}
          placeholder="e.g. Sapiens, or Bosch Impact Drill"
        />
        <SelectField
          label="Category"
          value={draft.category}
          onChange={set('category')}
          options={CATEGORIES}
        />
        <TextField
          label="Author / maker"
          value={draft.creator}
          onChange={set('creator')}
          error={errors.creator}
        />
        <TextField
          label="ISBN / serial number"
          value={draft.identifier}
          onChange={set('identifier')}
          error={errors.identifier}
        />
        <TextField
          label="Shelf or location"
          value={draft.location}
          onChange={set('location')}
          placeholder="A2, Tool wall, Locker 1"
          error={errors.location}
        />
        <TextField
          label="Replacement cost"
          type="number"
          min={0}
          value={draft.replacementCost}
          onChange={set('replacementCost')}
          hint="Used for shrinkage reporting"
          error={errors.replacementCost}
        />
        {editing ? (
          <SelectField
            label="Status"
            value={draft.status}
            onChange={set('status')}
            options={STATUSES}
          />
        ) : null}
        <TextField
          label="Label code"
          value={draft.code}
          onChange={set('code')}
          hint={editing ? 'Changing this invalidates printed labels' : 'Leave blank to generate one'}
          placeholder="BK-4F2A9C"
          error={errors.code}
        />
      </div>
    </Modal>
  );
}

/** Paste-a-list intake, for cataloguing a donated box in one go. */
export function BulkAddModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (rows: Array<Partial<Asset>>) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('book');
  const [busy, setBusy] = useState(false);

  const rows = parseRows(text, category);

  return (
    <Modal
      title="Add several items"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={rows.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(rows);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Add {rows.length || ''} item{rows.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <SelectField
          label="Category for all of these"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={CATEGORIES}
        />
        <TextArea
          label="One item per line"
          hint="Optionally add the author or maker after a comma: Sapiens, Yuval Noah Harari"
          rows={9}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'Sapiens, Yuval Noah Harari\nThings Fall Apart, Chinua Achebe\nClean Code'}
        />
        {rows.length > 0 ? (
          <p className="small muted">
            {rows.length} item{rows.length === 1 ? '' : 's'} ready. A label code will be generated
            for each.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function parseRows(text: string, category: string): Array<Partial<Asset>> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split(',');
      const creator = rest.join(',').trim();
      return {
        title: title!.trim(),
        category,
        ...(creator ? { creator } : {}),
      } as Partial<Asset>;
    })
    .filter((row) => row.title);
}
