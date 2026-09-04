import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, queryAll, TABLE, toEntity } from '../lib/ddb.js';
import { conflict, notFound } from '../lib/errors.js';
import { newAssetCode, newId } from '../lib/ids.js';
import { assetCodeLookupPk, GSI2, PK, PREFIX, SK } from './keys.js';
import type { Asset, AssetStatus } from './types.js';

export interface AssetInput {
  title: string;
  category?: string;
  code?: string;
  creator?: string;
  identifier?: string;
  location?: string;
  condition?: string;
  replacementCost?: number;
  tags?: string[];
  status?: AssetStatus;
}

/** Label prefix hints the category at a glance on a printed shelf tag. */
const CODE_PREFIXES: Record<string, string> = {
  book: 'BK',
  equipment: 'EQ',
  tool: 'TL',
  media: 'MD',
  device: 'DV',
};

function toItem(asset: Asset) {
  return {
    PK: PK(asset.orgId),
    SK: SK.asset(asset.assetId),
    entityType: 'Asset',
    gsi2pk: assetCodeLookupPk(asset.orgId, asset.code),
    gsi2sk: `ASSET#${asset.assetId}`,
    ...asset,
  };
}

export async function listAssets(orgId: string): Promise<Asset[]> {
  const items = await queryAll<Asset>({
    TableName: TABLE(),
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': PK(orgId), ':sk': PREFIX.asset },
  });
  return items.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAsset(orgId: string, assetId: string): Promise<Asset> {
  const result = await docClient().send(
    new GetCommand({ TableName: TABLE(), Key: { PK: PK(orgId), SK: SK.asset(assetId) } }),
  );
  if (!result.Item) throw notFound('Asset not found');
  return toEntity<Asset>(result.Item);
}

export async function findAssetByCode(orgId: string, code: string): Promise<Asset | undefined> {
  const items = await queryAll<Asset>({
    TableName: TABLE(),
    IndexName: GSI2,
    KeyConditionExpression: 'gsi2pk = :pk',
    ExpressionAttributeValues: { ':pk': assetCodeLookupPk(orgId, code) },
  });
  return items[0];
}

/**
 * Scanners hand us whatever the QR encoded. We accept the deep-link URL we
 * print, a raw asset id, or a typed-in label code, so a single lookup path
 * serves the camera and the keyboard.
 */
export async function resolveAssetRef(orgId: string, ref: string): Promise<Asset> {
  const trimmed = ref.trim();
  if (!trimmed) throw notFound('No asset reference supplied');

  const fromUrl = trimmed.match(/\/a\/([^/?#]+)/);
  const candidate = fromUrl?.[1] ?? trimmed;

  if (candidate.includes('-')) {
    const byCode = await findAssetByCode(orgId, candidate);
    if (byCode) return byCode;
  }

  try {
    return await getAsset(orgId, candidate);
  } catch {
    const byCode = await findAssetByCode(orgId, candidate);
    if (byCode) return byCode;
    throw notFound(`No asset matches "${ref}" in this branch`);
  }
}

export async function createAsset(orgId: string, input: AssetInput): Promise<Asset> {
  const category = input.category?.trim() || 'book';
  const code = (input.code?.trim() || newAssetCode(CODE_PREFIXES[category] ?? 'AS')).toUpperCase();

  const clash = await findAssetByCode(orgId, code);
  if (clash) {
    throw conflict('DUPLICATE_CODE', `Label code ${code} is already used by "${clash.title}".`);
  }

  const now = new Date().toISOString();
  const asset: Asset = {
    orgId,
    assetId: newId(),
    code,
    title: input.title.trim(),
    category,
    creator: input.creator?.trim() || undefined,
    identifier: input.identifier?.trim() || undefined,
    location: input.location?.trim() || undefined,
    condition: input.condition ?? 'good',
    replacementCost: input.replacementCost,
    tags: input.tags,
    status: input.status ?? 'available',
    timesBorrowed: 0,
    createdAt: now,
    updatedAt: now,
  };

  await docClient().send(
    new PutCommand({
      TableName: TABLE(),
      Item: toItem(asset),
      ConditionExpression: 'attribute_not_exists(SK)',
    }),
  );
  return asset;
}

export async function updateAsset(
  orgId: string,
  assetId: string,
  patch: Partial<AssetInput>,
): Promise<Asset> {
  const current = await getAsset(orgId, assetId);

  if (patch.code && patch.code.toUpperCase() !== current.code) {
    const clash = await findAssetByCode(orgId, patch.code);
    if (clash && clash.assetId !== assetId) {
      throw conflict('DUPLICATE_CODE', `Label code ${patch.code} is already in use.`);
    }
  }

  if (patch.status && current.status === 'checked_out' && patch.status !== 'checked_out') {
    // Status is owned by the checkout transaction while an item is on loan.
    throw conflict(
      'ASSET_ON_LOAN',
      `"${current.title}" is on loan. Check it in (or mark the loan lost) to change its status.`,
    );
  }

  const next: Asset = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    code: patch.code ? patch.code.toUpperCase() : current.code,
    orgId,
    assetId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  } as Asset;

  await docClient().send(new PutCommand({ TableName: TABLE(), Item: toItem(next) }));
  return next;
}

export async function deleteAsset(orgId: string, assetId: string): Promise<void> {
  const asset = await getAsset(orgId, assetId);
  if (asset.status === 'checked_out') {
    throw conflict('ASSET_ON_LOAN', `"${asset.title}" is on loan and cannot be deleted.`);
  }
  await docClient().send(
    new DeleteCommand({ TableName: TABLE(), Key: { PK: PK(orgId), SK: SK.asset(assetId) } }),
  );
}
