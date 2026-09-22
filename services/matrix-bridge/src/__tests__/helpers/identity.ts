import {
  bytesToHex,
  bytesToNumberLE,
  numberToBytesLE,
} from '@noble/curves/abstract/utils'
import { RistrettoPoint, ed25519 } from '@noble/curves/ed25519'
import { sha256, sha512 } from '@noble/hashes/sha2'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils'
import { sign } from '@scure/sr25519'

/*
 * Test-side replication of the iM8 identity stack. It exists so tests can
 * stand in for a real client: derive the identity keys a PARA seed would
 * give, and sign CD-M4 assertions with them.
 *
 * The math mirrors iM8/src/services/{keyDerivation,identitySignature}.ts
 * line for line, and the localpart vectors below are the ones pinned in
 * iM8's own suite (which pins them from the shared mubEZ derivation
 * vectors). If any of this disagrees with the bridge's identity-proof.ts,
 * one of the two copies has drifted from the spec — fix the code, not the
 * vector.
 */

const L = ed25519.CURVE.n

const DOMAIN_SPEND = 'm8/derive/spend/v1'
const DOMAIN_VIEW = 'm8/derive/view/v1'
const DOMAIN_IDENTITY = 'para-id/v1'
const DOMAIN_SIG_NONCE = 'para-id/sig-nonce/v1'

const IDENTITY_INDEXES = { public: 0, civic: 1, anonymous: 2 } as const
type Label = keyof typeof IDENTITY_INDEXES

function hashToScalar(...parts: Uint8Array[]): bigint {
  return bytesToNumberLE(sha512(concatBytes(...parts))) % L
}

function u32le(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ])
}

export interface TestIdentity {
  label: Label
  priv: bigint
  pub: Uint8Array
  pubHex: string
}

export function deriveIdentity(seed: Uint8Array, label: Label): TestIdentity {
  if (seed.length !== 32) throw new Error('seed must be exactly 32 bytes')
  const spendPriv = hashToScalar(utf8ToBytes(DOMAIN_SPEND), seed)
  const viewPriv = hashToScalar(utf8ToBytes(DOMAIN_VIEW), seed)
  const tweak = hashToScalar(
    utf8ToBytes(DOMAIN_IDENTITY),
    numberToBytesLE(viewPriv, 32),
    u32le(IDENTITY_INDEXES[label]),
  )
  const priv = (spendPriv + tweak) % L
  const pub = RistrettoPoint.BASE.multiply(priv).toRawBytes()
  return { label, priv, pub, pubHex: bytesToHex(pub) }
}

function encodeSecretScalar(scalar: bigint): Uint8Array {
  return numberToBytesLE((scalar << 3n) & (2n ** 256n - 1n), 32)
}

function deriveNonceSeed(scalar: bigint): Uint8Array {
  return sha512(
    concatBytes(utf8ToBytes(DOMAIN_SIG_NONCE), numberToBytesLE(scalar, 32)),
  ).subarray(0, 32)
}

function secretKeyFor(identity: TestIdentity): Uint8Array {
  const secret = new Uint8Array(64)
  secret.set(encodeSecretScalar(identity.priv), 0)
  secret.set(deriveNonceSeed(identity.priv), 32)
  return secret
}

/** Sign a CD-M4 assertion exactly as a client (iM8) would. */
export function signAssertion(
  identity: TestIdentity,
  input: {
    purpose: string
    audience: string
    challenge: string
    signedAt?: string
  },
): { assertion: any; signature: string } {
  const assertion = {
    type: 'para.identity.pop.v1',
    purpose: input.purpose,
    audience: input.audience,
    identityPub: identity.pubHex,
    challenge: input.challenge,
    signedAt: input.signedAt ?? new Date().toISOString(),
  }
  const encoded = utf8ToBytes(
    [
      'para-id/sig/v1',
      assertion.type,
      assertion.purpose,
      assertion.audience,
      assertion.identityPub,
      assertion.challenge,
      assertion.signedAt,
    ].join('\n'),
  )
  const secret = secretKeyFor(identity)
  try {
    return {
      assertion,
      signature: bytesToHex(sign(secret, encoded)),
    }
  } finally {
    secret.fill(0)
  }
}

/**
 * Pinned cross-repo vectors: seed hex → expected localparts, identical to
 * iM8's LOCALPART_VECTORS. These are the values the homeserver actually
 * knows accounts by — if the bridge's derivation drifts, every existing
 * user silently becomes someone else.
 */
export const PINNED_LOCALPARTS: Record<
  string,
  { public: string; anonymous: string }
> = {
  '0000000000000000000000000000000000000000000000000000000000000000': {
    public: 'k4o2lmcmitomgymtdb7y3htsthoofobo',
    anonymous: 'tksdt6ou5rbvxzeegiriy25u24pft5gz',
  },
  '0101010101010101010101010101010101010101010101010101010101010101': {
    public: '4hyygdnabmal525vs4ngqdcja7rxihxu',
    anonymous: 'cdx6xbqfawx7sqwpyvapwhwfvfu45l6f',
  },
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08': {
    public: 'vrj6nj2ieu5vcj77lyfa3zskcvtkftly',
    anonymous: 'uvbbhlafnltimfcsy7mlsptwdsasrt6y',
  },
}

export const TEST_SERVER_NAME = 'matrix.para.social'

/** Convenience: the hex sha256 of a string, for quick domain-sep probes. */
export const sha256Hex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)))
