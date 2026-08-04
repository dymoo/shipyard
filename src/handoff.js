import { timingSafeEqual } from 'node:crypto';

/** Compare the opaque Coder/Reviewer dispatch token without throwing on malformed Unicode. */
export function matchesHandoffToken(value, expected) {
  if (typeof value !== 'string' || !expected) return false;
  const actual = Buffer.from(value);
  const trusted = Buffer.from(expected);
  return actual.length === trusted.length && timingSafeEqual(actual, trusted);
}
