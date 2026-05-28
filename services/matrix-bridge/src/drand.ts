/**
 * Verifiable Randomness for PARA Sortition
 *
 * Uses drand (https://drand.love) — a decentralized, verifiable randomness beacon.
 * Every 30 seconds, drand emits a beacon that nobody can predict or manipulate.
 *
 * For sortition:
 * 1. We fetch the latest drand round (or a specific round for reproducibility)
 * 2. Combine beacon randomness + DID + communityUri
 * 3. Hash and derive chamber assignment
 * 4. The round number is published on-chain so anyone can verify
 *
 * This replaces deterministic djb2Hash with cryptographically verifiable randomness.
 */

import crypto from 'node:crypto'

const DRAND_API = 'https://api.drand.sh'
const DRAND_CHAIN_HASH =
  '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971' // Quicknet (3s frequency)

export interface DrandBeacon {
  round: number
  randomness: string
  signature?: string
}

export interface SortitionProof {
  round: number
  randomness: string
  did: string
  communityUri: string
  chamber: 'A' | 'B'
  hashInput: string
  hashOutput: string
  threshold: number
  timestamp: string
}

export interface AssemblySortitionHash {
  hashInput: string
  hashOutput: string
  hashValue: number
}

const MAX_UINT64 = Number((1n << 64n) - 1n)

/**
 * Hash one eligible citizen for a concrete Cabildeo assembly.
 *
 * The existing chamber proof uses beacon || did || community. Assembly
 * selection also includes the Cabildeo URI so a proof cannot be reused across
 * separate deliberations inside the same community.
 */
export function computeAssemblySortitionHash(
  did: string,
  communityUri: string,
  cabildeoUri: string,
  beacon: DrandBeacon,
): AssemblySortitionHash {
  const input = Buffer.concat([
    Buffer.from(beacon.randomness, 'hex'),
    Buffer.from(did, 'utf8'),
    Buffer.from(communityUri, 'utf8'),
    Buffer.from(cabildeoUri, 'utf8'),
  ])
  const hash = crypto.createHash('sha256').update(input).digest()
  const top64 = hash.readBigUInt64BE(0)
  return {
    hashInput: input.toString('hex'),
    hashOutput: hash.toString('hex'),
    hashValue: Number(top64) / MAX_UINT64,
  }
}

/**
 * Fetch the latest beacon from drand Quicknet.
 */
export async function fetchLatestBeacon(): Promise<DrandBeacon> {
  const res = await fetch(`${DRAND_API}/${DRAND_CHAIN_HASH}/public/latest`)
  if (!res.ok) {
    throw new Error(`drand fetch failed: ${res.status}`)
  }
  return res.json() as Promise<DrandBeacon>
}

/**
 * Fetch a specific round. Use this for reproducible verification.
 */
export async function fetchBeacon(round: number): Promise<DrandBeacon> {
  const res = await fetch(`${DRAND_API}/${DRAND_CHAIN_HASH}/public/${round}`)
  if (!res.ok) {
    throw new Error(`drand fetch failed for round ${round}: ${res.status}`)
  }
  return res.json() as Promise<DrandBeacon>
}

/**
 * Deterministic chamber assignment using verifiable randomness.
 *
 * @param did — user's DID
 * @param communityUri — community AT URI
 * @param beacon — drand beacon (round + randomness)
 * @param counts — current chamber sizes for load balancing
 * @returns chamber assignment + proof
 */
export function verifiableSortition(
  did: string,
  communityUri: string,
  beacon: DrandBeacon,
  counts?: { a: number; b: number },
): SortitionProof {
  // Combine beacon randomness with user+community for unique but verifiable output
  const input = Buffer.concat([
    Buffer.from(beacon.randomness, 'hex'),
    Buffer.from(did, 'utf8'),
    Buffer.from(communityUri, 'utf8'),
  ])

  const hash = crypto.createHash('sha256').update(input).digest()
  // Use first 4 bytes as a uint32 [0, 2^32)
  const value = hash.readUInt32BE(0) / 0xffffffff

  // Load balancing: if A has 55%+ more members, force threshold to favor B
  let threshold = 0.5
  if (counts) {
    const total = counts.a + counts.b
    if (total > 0) {
      const diff = counts.a / total - counts.b / total
      threshold = 0.5 - diff * 0.55 // shift threshold to favor under-represented chamber
      threshold = Math.max(0.1, Math.min(0.9, threshold))
    }
  }

  const chamber: 'A' | 'B' = value < threshold ? 'A' : 'B'

  return {
    round: beacon.round,
    randomness: beacon.randomness,
    did,
    communityUri,
    chamber,
    hashInput: input.toString('hex'),
    hashOutput: hash.toString('hex'),
    threshold,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Verify a sortition proof by re-running the calculation.
 */
export async function verifySortitionProof(
  proof: SortitionProof,
): Promise<boolean> {
  try {
    const beacon = await fetchBeacon(proof.round)
    if (beacon.randomness !== proof.randomness) return false

    const recomputed = verifiableSortition(
      proof.did,
      proof.communityUri,
      beacon,
    )
    return recomputed.chamber === proof.chamber
  } catch {
    return false
  }
}
