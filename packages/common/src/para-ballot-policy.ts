import {
  CABILDEO_BALLOT_COLLECTION,
  ballotWriteRefusal,
  reactionWriteRefusal,
} from './para-ballot-freeze.js'
import { verifyCabildeoDelegation } from './para-cabildeo-delegation-proof.js'
import { verifyPublicBallotProof } from './para-cabildeo-proof.js'

const DELEGATION_COLLECTION = 'com.para.civic.delegation'

/**
 * The whole ballot write policy for one record: the shape rules (frozen,
 * narrowed and reaction boxes, OD-7 §5h) followed by the m8 proof checks. The
 * refusal reason, or undefined when the write is allowed.
 *
 * Every path that writes a ballot-shaped record must call this and nothing
 * else, so the rules cannot drift between them. Today that is `@atproto/pds`
 * (`repo/prepare.ts`); a permissioned-space write path (OD-8) must call it too,
 * or a `signal` or `delegatedFrom` written there skips the freeze.
 *
 * Fails closed: a verifier that is unconfigured or unreachable refuses the write
 * and never falls back to account-only deduplication. Deletes are not writes
 * and stay outside this policy.
 */
export async function ballotWritePolicyRefusal(
  did: string,
  collection: string,
  record: unknown,
): Promise<string | undefined> {
  const refusal =
    ballotWriteRefusal(collection, record) ??
    reactionWriteRefusal(collection, record)
  if (refusal) return refusal

  if (collection === CABILDEO_BALLOT_COLLECTION) {
    try {
      if (!(await verifyPublicBallotProof(did, record))) {
        return 'A valid civic vote proof is required'
      }
    } catch {
      return 'Civic vote verification is unavailable; no vote was written'
    }
  }

  if (collection === DELEGATION_COLLECTION) {
    try {
      if (!(await verifyCabildeoDelegation(did, record))) {
        return 'A valid civic delegation proof is required'
      }
    } catch {
      return 'Civic delegation verification is unavailable; no delegation was written'
    }
  }

  return undefined
}
