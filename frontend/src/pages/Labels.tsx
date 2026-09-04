import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QrCode } from '../components/QrCode';
import { Icon } from '../components/Icon';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  SearchInput,
  SelectField,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { titleCase } from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import { assetScanPayload } from '../lib/scanner';
import type { Asset } from '../lib/types';

/**
 * Label printing is how a new branch actually gets started, so the page is
 * built around one action: pick items, hit print. The sheet is plain CSS grid
 * that the browser's own print dialog handles, which works with whatever
 * printer and sticker stock the branch already owns.
 */
export function Labels() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perRow, setPerRow] = useState('3');

  const debouncedQuery = useDebounced(query);
  const assets = useAsync<Asset[]>(
    () => api.listAssets({ q: debouncedQuery || undefined }).then((response) => response.items),
    [debouncedQuery],
  );

  const items = (assets.data ?? []).filter((asset) => !category || asset.category === category);
  const categories = [...new Set((assets.data ?? []).map((asset) => asset.category))].sort();
  const chosen = items.filter((asset) => selected.has(asset.assetId));

  function toggle(assetId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  return (
    <div className="stack">
      <div className="page-head no-print">
        <div className="col">
          <Link to="/assets" className="small row" style={{ gap: 6, marginBottom: 6 }}>
            <Icon name="back" size={14} /> Catalogue
          </Link>
          <h1>Print QR labels</h1>
          <p className="subtitle">
            Select the items you are labelling, then print onto plain paper or sticker sheets.
          </p>
        </div>
        <div className="btn-group">
          <Button
            onClick={() => setSelected(new Set(items.map((asset) => asset.assetId)))}
            disabled={items.length === 0}
          >
            Select all
          </Button>
          <Button onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Clear
          </Button>
          <Button
            variant="primary"
            icon="print"
            disabled={chosen.length === 0}
            onClick={() => window.print()}
          >
            Print {chosen.length || ''}
          </Button>
        </div>
      </div>

      <div className="row wrap no-print">
        <SearchInput value={query} onChange={setQuery} placeholder="Search the catalogue" />
        <SelectField
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={[
            { value: '', label: 'All categories' },
            ...categories.map((value) => ({ value, label: titleCase(value) })),
          ]}
        />
        <SelectField
          value={perRow}
          onChange={(event) => setPerRow(event.target.value)}
          options={[
            { value: '2', label: '2 per row (large)' },
            { value: '3', label: '3 per row' },
            { value: '4', label: '4 per row (small)' },
          ]}
        />
      </div>

      <Card className="no-print" title={`Choose items (${selected.size} selected)`} bodyClassName="">
        {assets.loading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing to label"
            description="Add items to the catalogue first, then come back to print their labels."
          />
        ) : (
          <div style={{ padding: '12px 18px', display: 'grid', gap: 8 }}>
            {items.map((asset) => (
              <Checkbox
                key={asset.assetId}
                checked={selected.has(asset.assetId)}
                onChange={() => toggle(asset.assetId)}
                label={
                  <span>
                    {asset.title} <span className="mono muted">{asset.code}</span>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Card>

      {chosen.length > 0 ? (
        <section>
          <h2 className="no-print" style={{ marginBottom: 12 }}>
            Preview
          </h2>
          <div
            className="label-sheet"
            style={{ gridTemplateColumns: `repeat(${perRow}, 1fr)` }}
          >
            {chosen.map((asset) => (
              <div className="label-tag" key={asset.assetId}>
                <QrCode
                  value={assetScanPayload(asset)}
                  size={150}
                  alt={`QR label for ${asset.title}`}
                />
                <div className="col">
                  <span className="label-title">{asset.title}</span>
                  <span className="label-code">{asset.code}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
