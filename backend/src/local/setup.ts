/**
 * Creates the local DynamoDB table and fills it with a believable branch so the
 * UI has something to render on first run: a mixed catalogue, members across
 * tiers, and loans that are current, due tomorrow, and overdue.
 *
 *   docker compose up -d && npm run seed
 */
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';

process.env.TABLE_NAME ??= 'shelfkit-local';
process.env.DYNAMO_ENDPOINT ??= 'http://localhost:8000';
process.env.AWS_REGION ??= 'eu-north-1';
process.env.AWS_ACCESS_KEY_ID ??= 'local';
process.env.AWS_SECRET_ACCESS_KEY ??= 'local';

const { createAsset } = await import('../domain/assets.js');
const { createMember } = await import('../domain/members.js');
const { checkoutAsset } = await import('../domain/checkouts.js');
const { ensureOrg, updateOrg } = await import('../domain/orgs.js');
const { docClient } = await import('../lib/ddb.js');
const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
const { PK, SK, openLoansPk, openLoansSk } = await import('../domain/keys.js');

const TABLE = process.env.TABLE_NAME!;
const ORG_ID = process.env.DEV_ORG_ID ?? 'dev-branch';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.DYNAMO_ENDPOINT,
});

async function recreateTable() {
  try {
    await client.send(new DeleteTableCommand({ TableName: TABLE }));
    console.log(`dropped existing table ${TABLE}`);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }

  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
        { AttributeName: 'gsi2pk', AttributeType: 'S' },
        { AttributeName: 'gsi2sk', AttributeType: 'S' },
        { AttributeName: 'gsi3pk', AttributeType: 'S' },
        { AttributeName: 'gsi3sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi2',
          KeySchema: [
            { AttributeName: 'gsi2pk', KeyType: 'HASH' },
            { AttributeName: 'gsi2sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi3',
          KeySchema: [
            { AttributeName: 'gsi3pk', KeyType: 'HASH' },
            { AttributeName: 'gsi3sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );

  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: TABLE });
  console.log(`created table ${TABLE}`);
}

const CATALOGUE = [
  { title: 'The Argumentative Indian', creator: 'Amartya Sen', category: 'book', location: 'A1' },
  { title: 'Things Fall Apart', creator: 'Chinua Achebe', category: 'book', location: 'A2' },
  { title: 'Sapiens', creator: 'Yuval Noah Harari', category: 'book', location: 'A2' },
  { title: 'Clean Code', creator: 'Robert C. Martin', category: 'book', location: 'B1' },
  { title: 'Midnight’s Children', creator: 'Salman Rushdie', category: 'book', location: 'A1' },
  { title: 'The God of Small Things', creator: 'Arundhati Roy', category: 'book', location: 'A3' },
  {
    title: 'Bosch GSB 600 Impact Drill',
    creator: 'Bosch',
    category: 'tool',
    location: 'Tool wall',
    replacementCost: 4200,
  },
  {
    title: 'Makita Orbital Sander',
    creator: 'Makita',
    category: 'tool',
    location: 'Tool wall',
    replacementCost: 6500,
  },
  {
    title: 'Canon EOS 200D Camera Kit',
    creator: 'Canon',
    category: 'equipment',
    location: 'Locker 2',
    replacementCost: 38000,
  },
  {
    title: 'Epson Portable Projector',
    creator: 'Epson',
    category: 'equipment',
    location: 'Locker 1',
    replacementCost: 27000,
  },
  {
    title: 'Raspberry Pi 5 Starter Kit',
    creator: 'Raspberry Pi Foundation',
    category: 'device',
    location: 'Shelf E',
    replacementCost: 9500,
  },
  { title: 'Planet Earth II (Blu-ray)', creator: 'BBC', category: 'media', location: 'Media rack' },
];

const PEOPLE = [
  { name: 'Ananya Sharma', phone: '9876543210', tier: 'premium' as const },
  { name: 'Rohit Verma', phone: '9812345678', tier: 'standard' as const },
  { name: 'Meera Iyer', phone: '9900112233', tier: 'standard' as const },
  { name: 'Daniel Fernandes', phone: '9765432109', tier: 'basic' as const },
  { name: 'Priya Nair', phone: '9123456780', tier: 'premium' as const },
  { name: 'Imran Qureshi', phone: '9345678123', tier: 'basic' as const },
];

/** Rewrites a loan's dates so the dashboard shows realistic overdue history. */
async function backdate(orgId: string, checkoutId: string, daysAgo: number, loanDays: number) {
  const { getCheckout } = await import('../domain/checkouts.js');
  const checkout = await getCheckout(orgId, checkoutId);
  const checkedOutAt = new Date(Date.now() - daysAgo * 86_400_000);
  const dueAt = new Date(checkedOutAt.getTime() + loanDays * 86_400_000);
  const updated = {
    ...checkout,
    checkedOutAt: checkedOutAt.toISOString(),
    dueAt: dueAt.toISOString(),
  };

  await docClient().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: PK(orgId),
        SK: SK.checkout(checkoutId),
        entityType: 'Checkout',
        gsi1pk: openLoansPk(orgId),
        gsi1sk: openLoansSk(updated.dueAt, checkoutId),
        gsi3pk: `ORG#${orgId}#MEMBER#${checkout.memberId}`,
        gsi3sk: `CHECKOUT#${checkoutId}`,
        ...updated,
      },
    }),
  );
}

await recreateTable();

const org = await ensureOrg(ORG_ID, 'Kanchan Community Library');
await updateOrg(ORG_ID, { contactPhone: '+91 80 4123 9000', defaultLoanDays: 14 });

const assets = [];
for (const entry of CATALOGUE) {
  assets.push(await createAsset(ORG_ID, entry));
}
console.log(`seeded ${assets.length} assets`);

const members = [];
for (const person of PEOPLE) {
  members.push(await createMember(ORG_ID, person, org.defaultCountryCode));
}
console.log(`seeded ${members.length} members`);

const loans: Array<[assetIndex: number, memberIndex: number, daysAgo: number]> = [
  [0, 0, 20],
  [6, 1, 16],
  [8, 2, 13],
  [3, 0, 5],
  [10, 4, 1],
];

for (const [assetIndex, memberIndex, daysAgo] of loans) {
  const fresh = await (await import('../domain/members.js')).getMember(
    ORG_ID,
    members[memberIndex]!.memberId,
  );
  const checkout = await checkoutAsset({
    org: { ...org, contactPhone: '+91 80 4123 9000' },
    member: fresh,
    asset: assets[assetIndex]!,
    actor: 'seed@localhost',
  });
  await backdate(ORG_ID, checkout.checkoutId, daysAgo, 14);
}
console.log(`seeded ${loans.length} active loans (two of them overdue)`);
console.log('\nReady. Start the API with: npm run dev');
