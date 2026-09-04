import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../AppContext';
import { AssetFormModal, draftFromAsset } from '../components/AssetForm';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/QrCode';
import { useToast } from '../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Notice,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { currency, dueLabel, formatDate, formatPhone, STATUS_TONE, titleCase } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { assetScanPayload } from '../lib/scanner';
import type { Asset, Checkout } from '../lib/types';

export function AssetDetail() {
  const { assetId = '' } = useParams();
  const { timezone, isAdmin, refreshCounts } = useSession();
  const toast = useToast();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const detail = useAsync<{ asset: Asset; activeCheckout?: Checkout }>(
    () => api.getAsset(assetId),
    [assetId],
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
        <Notice tone="danger">{detail.error?.message ?? 'This item could not be loaded.'}</Notice>
        <div>
          <Button icon="back" onClick={() => navigate('/assets')}>
            Back to catalogue
          </Button>
        </div>
      </div>
    );
  }

  const { asset, activeCheckout } = detail.data;

  async function checkIn() {
    if (!activeCheckout) return;
    setBusy(true);
    try {
      await api.checkin(activeCheckout.checkoutId);
      toast.success(`"${asset.title}" is back on the shelf.`);
      detail.reload();
      refreshCounts();
    } catch (error) {
      toast.failure(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div className="col">
          <Link to="/assets" className="small row" style={{ gap: 6, marginBottom: 6 }}>
            <Icon name="back" size={14} /> Catalogue
          </Link>
          <h1>{asset.title}</h1>
          <p className="subtitle">
            {[asset.creator, titleCase(asset.category), asset.location && `Shelf ${asset.location}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
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

      <div className="grid grid-2">
        <div className="stack">
          <Card title="Status">
            <div className="row-between">
              <Badge tone={STATUS_TONE[asset.status] ?? 'neutral'} dot>
                {asset.status === 'checked_out' ? 'On loan' : titleCase(asset.status)}
              </Badge>
              <span className="small muted">
                Borrowed {asset.timesBorrowed} time{asset.timesBorrowed === 1 ? '' : 's'}
              </span>
            </div>

            {activeCheckout ? (
              <>
                <div className="picked" style={{ marginTop: 14 }}>
                  <Avatar name={activeCheckout.memberName} />
                  <div className="col grow">
                    <Link to={`/members/${activeCheckout.memberId}`} className="small strong">
                      {activeCheckout.memberName}
                    </Link>
                    <span className="tiny muted">
                      {formatPhone(activeCheckout.memberPhone)} · since{' '}
                      {formatDate(activeCheckout.checkedOutAt, timezone)}
                    </span>
                  </div>
                  <Badge tone={dueLabel(activeCheckout.dueAt, timezone).tone} dot>
                    {dueLabel(activeCheckout.dueAt, timezone).text}
                  </Badge>
                </div>
                <Button
                  variant="primary"
                  block
                  style={{ marginTop: 12 }}
                  loading={busy}
                  onClick={checkIn}
                >
                  Check back in
                </Button>
              </>
            ) : asset.status === 'available' ? (
              <Button
                variant="primary"
                icon="scan"
                block
                style={{ marginTop: 14 }}
                onClick={() => navigate('/scan')}
              >
                Lend this item
              </Button>
            ) : null}
          </Card>

          <Card title="Details">
            <div className="stack" style={{ gap: 10 }}>
              <Detail label="Label code" value={<span className="mono">{asset.code}</span>} />
              <Detail label="Category" value={titleCase(asset.category)} />
              <Detail label="Author / maker" value={asset.creator ?? '—'} />
              <Detail label="ISBN / serial" value={asset.identifier ?? '—'} />
              <Detail label="Shelf" value={asset.location ?? '—'} />
              <Detail label="Condition" value={titleCase(asset.condition ?? 'good')} />
              <Detail label="Replacement cost" value={currency(asset.replacementCost)} />
              <Detail label="Added" value={formatDate(asset.createdAt, timezone)} />
            </div>
          </Card>
        </div>

        <Card
          title="Label"
          actions={
            <Button size="sm" icon="print" onClick={() => navigate('/assets/labels')}>
              Print sheet
            </Button>
          }
        >
          <div className="col center" style={{ alignItems: 'center', gap: 12 }}>
            <QrCode value={assetScanPayload(asset)} size={200} alt={`QR label for ${asset.title}`} />
            <div className="center">
              <div className="strong small">{asset.title}</div>
              <div className="mono muted">{asset.code}</div>
            </div>
            <p className="tiny muted center" style={{ maxWidth: 260 }}>
              Stick this on the item. A handheld scanner reads the QR (or the code underneath)
              into the desk screen.
            </p>
          </div>
        </Card>
      </div>

      {editing ? (
        <AssetFormModal
          title="Edit item"
          submitLabel="Save changes"
          editing
          initial={draftFromAsset(asset)}
          onClose={() => setEditing(false)}
          onSubmit={async (payload) => {
            await api.updateAsset(asset.assetId, payload);
            toast.success('Item updated.');
            detail.reload();
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this item?"
          destructive
          confirmLabel="Delete permanently"
          busy={busy}
          message={
            <>
              <strong>{asset.title}</strong> will be removed from the catalogue. Past loan history
              stays in your records. This cannot be undone.
            </>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.deleteAsset(asset.assetId);
              toast.success('Item deleted.');
              navigate('/assets');
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

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row-between small">
      <span className="muted">{label}</span>
      <span className="strong">{value}</span>
    </div>
  );
}
