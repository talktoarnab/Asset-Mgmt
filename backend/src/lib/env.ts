function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get tableName(): string {
    return required('TABLE_NAME');
  },
  get region(): string {
    return process.env.AWS_REGION ?? 'eu-north-1';
  },
  get stage(): string {
    return process.env.STAGE ?? 'dev';
  },
  get orgId(): string {
    return process.env.ORG_ID ?? 'main';
  },
  get orgName(): string {
    return process.env.ORG_NAME ?? 'My Library';
  },
  get deskPin(): string {
    return process.env.DESK_PIN ?? '123456';
  },
  get sessionSecret(): string {
    return process.env.SESSION_SECRET ?? 'dev-session-secret-change-me';
  },
  /** "dev" accepts any PIN so local seed data is one command away. */
  get authMode(): 'pin' | 'dev' {
    return process.env.AUTH_MODE === 'dev' ? 'dev' : 'pin';
  },
  get dynamoEndpoint(): string | undefined {
    return process.env.DYNAMO_ENDPOINT;
  },
};
