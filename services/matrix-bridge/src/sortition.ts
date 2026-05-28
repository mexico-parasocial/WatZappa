/**
 * Sortition (random assignment) logic for bi-cameral deliberation.
 *
 * Two modes:
 *   A) Deterministic — djb2Hash(did + communityUri). Fast, reproducible, but
 *      theoretically predictable if you know the inputs.
 *   B) Verifiable — uses drand beacon + SHA-256. Cryptographically secure,
 *      publicly verifiable, and transparent.
 *
 * For production, Verifiable Sortition is recommended.
 */

import {
  type SortitionProof,
  fetchLatestBeacon,
  verifiableSortition,
} from './drand.js'

function djb2Hash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash
}

export function assignChamber(did: string, communityUri: string): 'A' | 'B' {
  const hash = djb2Hash(did + '|' + communityUri)
  return hash % 2 === 0 ? 'A' : 'B'
}

export function assignChamberBalanced(
  did: string,
  communityUri: string,
  countA: number,
  countB: number,
): 'A' | 'B' {
  const base = assignChamber(did, communityUri)
  const total = countA + countB
  if (total === 0) return base

  const ratioA = countA / total
  const ratioB = countB / total

  if (ratioA >= 0.45 && ratioA <= 0.55) return base
  if (ratioA > 0.55 && base === 'A') return 'B'
  if (ratioB > 0.55 && base === 'B') return 'A'

  return base
}

/**
 * Verifiable sortition using drand.
 * Fetches a beacon and returns chamber assignment + cryptographic proof.
 */
export async function assignChamberVerifiable(
  did: string,
  communityUri: string,
  countA: number,
  countB: number,
): Promise<SortitionProof & { chamber: 'A' | 'B' }> {
  const beacon = await fetchLatestBeacon()
  return verifiableSortition(did, communityUri, beacon, {
    a: countA,
    b: countB,
  })
}

/**
 * Synchronous verifiable sortition when you already have the beacon.
 */
export function assignChamberWithBeacon(
  did: string,
  communityUri: string,
  beacon: { round: number; randomness: string },
  countA: number,
  countB: number,
): SortitionProof & { chamber: 'A' | 'B' } {
  return verifiableSortition(did, communityUri, beacon, {
    a: countA,
    b: countB,
  })
}
