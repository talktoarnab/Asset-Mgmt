import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, no I/L/O/U

/**
 * Lexicographically sortable identifier: 10 chars of millisecond timestamp
 * followed by 12 random chars. Sorting by id therefore sorts by creation time,
 * which lets us range-query history without a dedicated timestamp index.
 */
export function newId(prefix?: string): string {
  let timePart = '';
  let time = Date.now();
  for (let i = 0; i < 10; i += 1) {
    timePart = ALPHABET[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(12);
  let randomPart = '';
  for (let i = 0; i < 12; i += 1) {
    randomPart += ALPHABET[bytes[i]! % 32];
  }
  const id = timePart + randomPart;
  return prefix ? `${prefix}_${id}` : id;
}

export const uuid = (): string => randomUUID();

/**
 * Human-readable label code printed under the QR square, e.g. "BK-4F2A9C".
 * Staff read these aloud and type them when a label is scuffed beyond scanning.
 */
export function newAssetCode(prefix: string): string {
  const bytes = randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[bytes[i]! % 32];
  }
  return `${prefix.toUpperCase()}-${suffix}`;
}
