import { createHmac, timingSafeEqual } from 'node:crypto';

/** Bind a dispatch proof to the only state transition its receiver may make. */
export function createHandoffProof(secret, { direction, owner, repo, issue, pull, repairRound, headSha }) {
  if (typeof secret !== 'string' || !secret) throw new Error('Shipyard hand-off token is required.');
  return createHmac('sha256', secret)
    .update([direction, owner, repo, issue, pull, repairRound, headSha].join('\n'))
    .digest('base64url');
}

/** A retained dispatch cannot be changed to authorise a different PR, commit, or round. */
export function verifiesHandoffProof(secret, handoff, proof) {
  if (typeof proof !== 'string' || !proof) return false;
  const expected = Buffer.from(createHandoffProof(secret, handoff));
  const actual = Buffer.from(proof);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
