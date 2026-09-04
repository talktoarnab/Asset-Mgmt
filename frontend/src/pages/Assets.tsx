import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../AppContext';
import { AssetFormModal, BulkAddModal, emptyDraft } from '../components/AssetForm';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  SelectField,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { dueLabel, STATUS_TONE, titleCase } from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import type { Asset } from '../lib/types';

export function Assets() {
  const { timezone } = useSession();
  const toast = useToast();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);

  const debouncedQuery = useDebounced(query);
  const assets = useAsync<Asset[]>(
    () =>
      api
        .listAssets({ q: debouncedQuery || undefined, status: status || undefined })
        .then((response) => response.items),
    [debouncedQuery, status],
  );

  const items = (assets.data ?? []).filter(
    (asset) => !category || asset.category === category,
  );
  const categories = [...new Set((assets.data ?? []).map((asset) => asset.category))].sort();

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p className="subtitle">
            {assets.data
              ? `${assets.data.length} item${assets.data.length === 1 ? '' : 's'} on the shelves.`
              : 'Loading the catalogue…'}
          </p>
        </div>
        <div className="btn-group">
          <Button icon="print" onClick={() => navigate('/assets/labels')}>
            <span className="hide-sm">Print labels</span>
          </Button>
          <Button onClick={() => setBulkAdding(true)}>Add several</Button>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Add item
          </Button>
        </div>
      </div>

      <div className="row wrap">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search titles, codes, authors, shelves"
        />
        <SelectField
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          wrapClassName="hide-sm"
          options={[
            { value: '', label: 'Any status' },
            { value: 'available', label: 'Available' },
            { value: 'checked_out', label: 'On loan' },
            { value: 'maintenance', label: 'Maintenance' },
            { value: 'lost', label: 'Lost' },
            { value: 'retired', label: 'Retired' },
          ]}
        />
        <SelectField
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          wrapClassName="hide-sm"
          options={[
            { value: '', label: 'All categories' },
            ...categories.map((value) => ({ value, label: titleCase(value) })),
          ]}
        />
      </div>

      <Card bodyClassName="">
        {assets.loading ? (
          <TableSkeleton columns={5} />
        ) : items.length === 0 ? (
          <EmptyState
            title={query ? 'No items match your search' : 'The catalogue is empty'}
            description={
              query
                ? 'Try a different title, code or shelf.'
                : 'Add your first book, tool or piece of equipment to start lending it out.'
            }
            action={
              query ? null : (
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  Add the first item
                </Button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="hide-sm">Category</th>
                  <th className="hide-sm">Shelf</th>
                  <th>Status</th>
                  <th className="right hide-sm">Times out</th>
                </tr>
              </thead>
              <tbody>
                {items.map((asset) => (
                  <tr
                    key={asset.assetId}
                    className="clickable"
                    onClick={() => navigate(`/assets/${asset.assetId}`)}
                  >
                    <td>
                      <div className="col">
                        <Link to={`/assets/${asset.assetId}`} className="strong">
                          {asset.title}
                        </Link>
                        <span className="tiny muted truncate">
                          <span className="mono">{asset.code}</span>
                          {asset.creator ? ` · ${asset.creator}` : ''}
                        </span>
                      </div>
                    </td>
                    <td className="hide-sm small muted">{titleCase(asset.category)}</td>
                    <td className="hide-sm small muted">{asset.location ?? '—'}</td>
                    <td>
                      <div className="col">
                        <Badge tone={STATUS_TONE[asset.status] ?? 'neutral'} dot>
                          {asset.status === 'checked_out' ? 'On loan' : titleCase(asset.status)}
                        </Badge>
                        {asset.status === 'checked_out' && asset.dueAt ? (
                          <span className="tiny muted">
                            {asset.activeMemberName} · {dueLabel(asset.dueAt, timezone).text}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="right small muted hide-sm">{asset.timesBorrowed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding ? (
        <AssetFormModal
          title="Add an item"
          submitLabel="Add item"
          initial={emptyDraft()}
          onClose={() => setAdding(false)}
          onSubmit={async (payload) => {
            const asset = await api.createAsset(payload);
            toast.success(`"${asset.title}" added with code ${asset.code}.`);
            assets.reload();
          }}
        />
      ) : null}

      {bulkAdding ? (
        <BulkAddModal
          onClose={() => setBulkAdding(false)}
          onSubmit={async (rows) => {
            try {
              const result = await api.createAssets(rows);
              if (result.failed > 0) {
                toast.notify(
                  `Added ${result.created}, skipped ${result.failed} that could not be created.`,
                  'error',
                );
              } else {
                toast.success(`Added ${result.created} items.`);
              }
              assets.reload();
            } catch (error) {
              toast.failure(error);
            }
          }}
        />
      ) : null}
    </div>
  );
}
