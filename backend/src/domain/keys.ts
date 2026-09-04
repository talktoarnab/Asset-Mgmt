/**
 * Single-table layout
 * ===================
 * Every tenant (a library branch / tool room) is one partition, so all reads
 * for a branch stay inside one partition key and cost one Query.
 *
 *  Entity        PK                SK                     GSI1 (open loans)          GSI2 (lookup)                 GSI3 (history)
 *  -----------------------------------------------------------------------------------------------------------------------------
 *  Org           ORG#<org>         ORG                    -                          ORGS / ORG#<org>              -
 *  Member        ORG#<org>         MEMBER#<id>            -                          ORG#<org>#PHONE#<e164>        -
 *  Asset         ORG#<org>         ASSET#<id>             -                          ORG#<org>#CODE#<code>         -
 *  Checkout      ORG#<org>         CHECKOUT#<id>          ORG#<org>#OPEN / <dueAt>   -                             ORG#<org>#MEMBER#<id>
 *  Notification  ORG#<org>         NOTIF#<id>             -                          -                             ORG#<org>#MEMBER#<id>
 *
 * GSI1 is sparse: the attributes are removed on check-in, so it only ever holds
 * currently borrowed items sorted by due date. That makes both the overdue
 * dashboard and the nightly reminder sweep a single ranged Query.
 */

export const PK = (orgId: string) => `ORG#${orgId}`;

export const SK = {
  org: () => 'ORG',
  member: (memberId: string) => `MEMBER#${memberId}`,
  asset: (assetId: string) => `ASSET#${assetId}`,
  checkout: (checkoutId: string) => `CHECKOUT#${checkoutId}`,
  notification: (notificationId: string) => `NOTIF#${notificationId}`,
};

export const PREFIX = {
  member: 'MEMBER#',
  asset: 'ASSET#',
  checkout: 'CHECKOUT#',
  notification: 'NOTIF#',
};

export const GSI1 = 'gsi1';
export const GSI2 = 'gsi2';
export const GSI3 = 'gsi3';

export const openLoansPk = (orgId: string) => `ORG#${orgId}#OPEN`;
/** dueAt first so the range key sorts by urgency; id keeps it unique. */
export const openLoansSk = (dueAt: string, checkoutId: string) => `${dueAt}#${checkoutId}`;

export const ORG_REGISTRY_PK = 'ORGS';
export const phoneLookupPk = (orgId: string, phone: string) => `ORG#${orgId}#PHONE#${phone}`;
export const assetCodeLookupPk = (orgId: string, code: string) =>
  `ORG#${orgId}#CODE#${code.toUpperCase()}`;

export const memberHistoryPk = (orgId: string, memberId: string) =>
  `ORG#${orgId}#MEMBER#${memberId}`;

export function idFromSk(sk: string, prefix: string): string {
  return sk.startsWith(prefix) ? sk.slice(prefix.length) : sk;
}
