import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  actorLabel,
  authContextFrom,
  deskStaff,
  issueSession,
  pinMatches,
  requireRole,
} from '../lib/auth.js';
import { env } from '../lib/env.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { created, errorResponse, json, noContent, ok, parseBody } from '../lib/http.js';
import { Router } from '../lib/router.js';
import { buildReport, buildSummary } from '../domain/analytics.js';
import {
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
  resolveAssetRef,
  updateAsset,
} from '../domain/assets.js';
import {
  checkoutAsset,
  closeCheckout,
  getCheckout,
  listMemberHistory,
  listOpenLoans,
  listRecentCheckouts,
  renewCheckout,
} from '../domain/checkouts.js';
import {
  createMember,
  deleteMember,
  getMember,
  listMembers,
  setOpenLoanCount,
  updateMember,
} from '../domain/members.js';
import { ensureOrg, updateOrg } from '../domain/orgs.js';
import { evaluateEligibility } from '../domain/rules.js';
import {
  assetBulkSchema,
  assetCreateSchema,
  assetUpdateSchema,
  checkinByRefSchema,
  checkinSchema,
  checkoutCreateSchema,
  loginSchema,
  memberCreateSchema,
  memberUpdateSchema,
  scanSchema,
  settingsSchema,
} from '../domain/schemas.js';
import type { AuthContext } from '../domain/types.js';

const router = new Router<AuthContext>();

router.post('/v1/auth/login', async ({ body, isBase64Encoded }) => {
  const { pin } = parseBody(loginSchema, body, isBase64Encoded);
  if (!pinMatches(pin)) throw unauthorized('That PIN is not recognised.');

  const auth = deskStaff();
  const org = await ensureOrg(auth.orgId, env.orgName);
  return ok({ token: issueSession(auth), user: auth, org });
});

router.get('/v1/me', async ({ auth }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  return ok({ user: auth, org });
});

router.get('/v1/settings', async ({ auth }) => ok(await ensureOrg(auth.orgId, env.orgName)));

router.patch('/v1/settings', async ({ auth, body, isBase64Encoded }) => {
  requireRole(auth, 'admin');
  await ensureOrg(auth.orgId, env.orgName);
  const patch = parseBody(settingsSchema, body, isBase64Encoded);
  return ok(await updateOrg(auth.orgId, patch));
});

// ---------------------------------------------------------------- members ---

router.get('/v1/members', async ({ auth, query }) => {
  const members = await listMembers(auth.orgId);
  const term = query.q?.trim().toLowerCase();
  if (!term) return ok({ items: members, total: members.length });

  const digits = term.replace(/\D/g, '');
  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(term) ||
      (digits.length >= 3 && m.phone.includes(digits)) ||
      (m.email ?? '').toLowerCase().includes(term),
  );
  return ok({ items: filtered, total: filtered.length });
});

router.post('/v1/members', async ({ auth, body, isBase64Encoded }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const input = parseBody(memberCreateSchema, body, isBase64Encoded);
  const member = await createMember(
    auth.orgId,
    { ...input, email: input.email || undefined },
    org.defaultCountryCode,
  );
  return created(member);
});

router.get('/v1/members/{memberId}', async ({ auth, params }) =>
  ok(await getMember(auth.orgId, params.memberId!)),
);

router.patch('/v1/members/{memberId}', async ({ auth, params, body, isBase64Encoded }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const patch = parseBody(memberUpdateSchema, body, isBase64Encoded);
  const member = await updateMember(
    auth.orgId,
    params.memberId!,
    { ...patch, email: patch.email || undefined },
    org.defaultCountryCode,
  );
  return ok(member);
});

router.delete('/v1/members/{memberId}', async ({ auth, params }) => {
  requireRole(auth, 'admin');
  await deleteMember(auth.orgId, params.memberId!);
  return noContent();
});

router.get('/v1/members/{memberId}/history', async ({ auth, params }) => {
  const [member, history] = await Promise.all([
    getMember(auth.orgId, params.memberId!),
    listMemberHistory(auth.orgId, params.memberId!),
  ]);
  return ok({ member, items: history });
});

// ----------------------------------------------------------------- assets ---

router.get('/v1/assets', async ({ auth, query }) => {
  const assets = await listAssets(auth.orgId);
  const term = query.q?.trim().toLowerCase();
  const status = query.status?.trim();
  const category = query.category?.trim();

  const filtered = assets.filter((asset) => {
    if (status && asset.status !== status) return false;
    if (category && asset.category !== category) return false;
    if (!term) return true;
    return (
      asset.title.toLowerCase().includes(term) ||
      asset.code.toLowerCase().includes(term) ||
      (asset.creator ?? '').toLowerCase().includes(term) ||
      (asset.identifier ?? '').toLowerCase().includes(term) ||
      (asset.location ?? '').toLowerCase().includes(term)
    );
  });

  return ok({ items: filtered, total: filtered.length });
});

router.post('/v1/assets', async ({ auth, body, isBase64Encoded }) => {
  await ensureOrg(auth.orgId, env.orgName);
  const input = parseBody(assetCreateSchema, body, isBase64Encoded);
  return created(await createAsset(auth.orgId, input));
});

router.post('/v1/assets/bulk', async ({ auth, body, isBase64Encoded }) => {
  await ensureOrg(auth.orgId, env.orgName);
  const { assets } = parseBody(assetBulkSchema, body, isBase64Encoded);

  const results = [];
  for (const input of assets) {
    try {
      results.push({ ok: true as const, asset: await createAsset(auth.orgId, input) });
    } catch (error) {
      results.push({
        ok: false as const,
        title: input.title,
        error: error instanceof Error ? error.message : 'Could not be added',
      });
    }
  }

  return json(207, {
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

router.get('/v1/assets/{assetId}', async ({ auth, params }) => {
  const asset = await getAsset(auth.orgId, params.assetId!);
  const activeCheckout = asset.activeCheckoutId
    ? await getCheckout(auth.orgId, asset.activeCheckoutId).catch(() => undefined)
    : undefined;
  return ok({ asset, activeCheckout });
});

router.patch('/v1/assets/{assetId}', async ({ auth, params, body, isBase64Encoded }) => {
  const patch = parseBody(assetUpdateSchema, body, isBase64Encoded);
  return ok(await updateAsset(auth.orgId, params.assetId!, patch));
});

router.delete('/v1/assets/{assetId}', async ({ auth, params }) => {
  requireRole(auth, 'admin');
  await deleteAsset(auth.orgId, params.assetId!);
  return noContent();
});

// ------------------------------------------------------------------- scan ---

/**
 * One round trip for the desk: what did we just scan, who has it, and would
 * this member be allowed to take it. Handheld scanners (and a future camera)
 * both land here.
 */
router.post('/v1/scan', async ({ auth, body, isBase64Encoded }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const { ref, memberId } = parseBody(scanSchema, body, isBase64Encoded);
  const asset = await resolveAssetRef(auth.orgId, ref);

  const activeCheckout = asset.activeCheckoutId
    ? await getCheckout(auth.orgId, asset.activeCheckoutId).catch(() => undefined)
    : undefined;

  const member = memberId ? await getMember(auth.orgId, memberId) : undefined;
  const blockers = member ? evaluateEligibility({ org, member, asset, now: new Date() }) : [];

  return ok({
    asset,
    activeCheckout,
    member,
    blockers,
    suggestedAction: asset.status === 'checked_out' ? 'checkin' : 'checkout',
  });
});

// -------------------------------------------------------------- checkouts ---

router.get('/v1/checkouts', async ({ auth, query }) => {
  const status = query.status ?? 'open';

  if (status === 'open' || status === 'overdue') {
    const now = new Date();
    const loans = await listOpenLoans(auth.orgId);
    const items = status === 'overdue' ? loans.filter((l) => new Date(l.dueAt) < now) : loans;
    return ok({ items, total: items.length });
  }

  const items = await listRecentCheckouts(auth.orgId, Number(query.limit ?? 100));
  return ok({ items, total: items.length });
});

router.post('/v1/checkouts', async ({ auth, body, isBase64Encoded }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const input = parseBody(checkoutCreateSchema, body, isBase64Encoded);

  const [asset, member] = await Promise.all([
    resolveAssetRef(auth.orgId, input.assetRef),
    getMember(auth.orgId, input.memberId),
  ]);

  const checkout = await checkoutAsset({
    org,
    member,
    asset,
    loanDays: input.loanDays,
    notes: input.notes,
    actor: actorLabel(auth),
  });

  return created({ checkout, asset: { ...asset, status: 'checked_out' }, member });
});

router.post('/v1/checkouts/{checkoutId}/checkin', async ({ auth, params, body, isBase64Encoded }) => {
  const input = body ? parseBody(checkinSchema, body, isBase64Encoded) : {};
  const checkout = await getCheckout(auth.orgId, params.checkoutId!);
  const closed = await closeCheckout(checkout, {
    actor: actorLabel(auth),
    outcome: 'returned',
    condition: input.condition,
    notes: input.notes,
  });
  return ok(closed);
});

/** Fast desk path: scan the item, hand it back to the shelf, done. */
router.post('/v1/checkins', async ({ auth, body, isBase64Encoded }) => {
  await ensureOrg(auth.orgId, env.orgName);
  const input = parseBody(checkinByRefSchema, body, isBase64Encoded);
  const asset = await resolveAssetRef(auth.orgId, input.assetRef);

  if (!asset.activeCheckoutId) {
    throw conflict(
      'NOT_ON_LOAN',
      `"${asset.title}" is not currently checked out, so there is nothing to return.`,
    );
  }

  const checkout = await getCheckout(auth.orgId, asset.activeCheckoutId);
  const closed = await closeCheckout(checkout, {
    actor: actorLabel(auth),
    outcome: 'returned',
    condition: input.condition,
    notes: input.notes,
  });
  return ok({ checkout: closed, asset: { ...asset, status: 'available' } });
});

router.post('/v1/checkouts/{checkoutId}/renew', async ({ auth, params }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const checkout = await getCheckout(auth.orgId, params.checkoutId!);
  return ok(await renewCheckout(checkout, org, actorLabel(auth)));
});

router.post('/v1/checkouts/{checkoutId}/lost', async ({ auth, params, body, isBase64Encoded }) => {
  requireRole(auth, 'admin');
  const input = body ? parseBody(checkinSchema, body, isBase64Encoded) : {};
  const checkout = await getCheckout(auth.orgId, params.checkoutId!);
  return ok(
    await closeCheckout(checkout, {
      actor: actorLabel(auth),
      outcome: 'lost',
      notes: input.notes,
    }),
  );
});

// -------------------------------------------------------------- reporting ---

router.get('/v1/analytics/summary', async ({ auth }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const [assets, members, openLoans, recent] = await Promise.all([
    listAssets(auth.orgId),
    listMembers(auth.orgId),
    listOpenLoans(auth.orgId),
    listRecentCheckouts(auth.orgId, 500),
  ]);
  return ok(buildSummary(org, assets, members, openLoans, recent));
});

router.get('/v1/analytics/report', async ({ auth }) => {
  const org = await ensureOrg(auth.orgId, env.orgName);
  const [assets, members, openLoans, recent] = await Promise.all([
    listAssets(auth.orgId),
    listMembers(auth.orgId),
    listOpenLoans(auth.orgId),
    listRecentCheckouts(auth.orgId, 1000),
  ]);
  return ok(buildReport(org, assets, members, openLoans, recent));
});

router.post('/v1/maintenance/reconcile', async ({ auth }) => {
  requireRole(auth, 'admin');
  const [members, openLoans] = await Promise.all([
    listMembers(auth.orgId),
    listOpenLoans(auth.orgId),
  ]);

  const counts = new Map<string, number>();
  for (const loan of openLoans) {
    counts.set(loan.memberId, (counts.get(loan.memberId) ?? 0) + 1);
  }

  const repaired: string[] = [];
  for (const member of members) {
    const actual = counts.get(member.memberId) ?? 0;
    if (actual !== member.openLoans) {
      await setOpenLoanCount(auth.orgId, member.memberId, actual);
      repaired.push(member.memberId);
    }
  }

  return ok({ checked: members.length, repaired: repaired.length, memberIds: repaired });
});

const PUBLIC_ROUTES = new Set(['POST /v1/auth/login']);

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '/';

  try {
    const auth = PUBLIC_ROUTES.has(`${method} ${path}`)
      ? deskStaff()
      : authContextFrom(event);
    return await router.handle({
      method,
      path,
      query: event.queryStringParameters ?? {},
      body: event.body,
      isBase64Encoded: Boolean(event.isBase64Encoded),
      auth,
    });
  } catch (error) {
    if (!(error && typeof error === 'object' && 'status' in error)) {
      console.error(JSON.stringify({ event: 'request.error', method, path }), error);
    }
    return errorResponse(error);
  }
}

export { router };
