import { sha256 } from '@noble/hashes/sha2'
import { utf8ToBytes, concatBytes } from '@noble/hashes/utils'
import { verify } from '@scure/sr25519'

/*
 * The identity half of para-idp: verify that a client holds the key it claims,
 * then derive the Matrix localpart from that key.
 *
 * Both halves are specified elsewhere and this file must agree with them byte
 * for byte:
 *   - signature scheme  mubEZ/docs/IDENTITY_SIGNATURES.md          (CD-7)
 *   - localpart         WatZappa/docs/MATRIX_V2.md §4              (CD-M1)
 *
 * It is a deliberate re-implementation rather than a shared package: mubEZ and
 * WatZappa are separate repositories and services. The shared test vectors are
 * what keep the copies honest — see src/__tests__, which asserts against the
 * files mubEZ publishes. If those tests fail, this file has drifted and
 * signatures made on a device will not verify here.
 *
 * Nothing in this module holds private key material. para-idp verifies; it
 * never signs as a user.
 */

export const DOMAIN_IDENTITY_SIG = 'para-id/sig/v1'
export const DOMAIN_MATRIX_LOCALPART = 'para-id/matrix-localpart/v1'

export const SIG_PURPOSES = ['matrix-login', 'mubez-registration'] as const
export type SigPurpose = (typeof SIG_PURPOSES)[number]

export interface IdentityAssertion {
  type: 'para.identity.pop.v1'
  purpose: SigPurpose
  audience: string
  identityPub: string
  challenge: string
  signedAt: string
}

export interface SignedAssertion {
  assertion: IdentityAssertion
  signature: string
}

export interface VerifyExpectation {
  purpose: SigPurpose
  audience: string
  challenge: string
  maxAgeMs?: number
  now?: Date
}

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 1000
const LOCALPART_BYTES = 20
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function hexToBytesStrict(hex: string, length: number): Uint8Array {
  if (typeof hex !== 'string' || hex.length !== length * 2) {
    throw new Error('bad hex length')
  }
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error('bad hex')
    out[i] = byte
  }
  return out
}

/** RFC 4648 base32, lowercased and unpadded. See CD-M1. */
export function base32LowerNoPad(bytes: Uint8Array): string {
  let value = 0
  let bits = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/**
 * localpart = base32(sha256(DOMAIN ‖ identity_pub)[0..20])
 *
 * This is what makes a Matrix account a pure function of client-held key
 * material: no table anywhere needs to relate a DID to an account, because the
 * server can always recompute the name from the key it was shown.
 */
export function matrixLocalpart(identityPub: Uint8Array): string {
  if (identityPub.length !== 32) {
    throw new Error('identity public key must be exactly 32 bytes')
  }
  const digest = sha256(
    concatBytes(utf8ToBytes(DOMAIN_MATRIX_LOCALPART), identityPub),
  )
  return base32LowerNoPad(digest.subarray(0, LOCALPART_BYTES))
}

/** Canonical encoding: seven fields joined with LF, domain first. */
export function encodeAssertion(a: IdentityAssertion): Uint8Array {
  return utf8ToBytes(
    [
      DOMAIN_IDENTITY_SIG,
      a.type,
      a.purpose,
      a.audience,
      a.identityPub,
      a.challenge,
      a.signedAt,
    ].join('\n'),
  )
}

/**
 * Verify a proof of possession. Returns a boolean and never throws.
 *
 * Everything here is attacker-controlled. `@scure/sr25519`'s verify() raises on
 * a malformed point and a null body raises before any field is read; unguarded,
 * both turn garbage into a 500 rather than an authentication failure.
 *
 * The caller must consume the challenge on success — this function has no
 * store. See challenges.ts.
 */
export function verifyIdentityAssertion(
  signed: SignedAssertion,
  expected: VerifyExpectation,
): boolean {
  try {
    if (!signed || typeof signed !== 'object') return false
    const { assertion, signature } = signed
    if (!assertion || typeof assertion !== 'object') return false
    if (typeof signature !== 'string') return false

    if (assertion.type !== 'para.identity.pop.v1') return false
    // Never accept "any purpose": mubEZ registration and Matrix login sign
    // with the same key, so one must not be usable as the other.
    if (assertion.purpose !== expected.purpose) return false
    if (assertion.audience !== expected.audience) return false
    if (assertion.challenge !== expected.challenge) return false

    const signedAt = Date.parse(assertion.signedAt)
    if (Number.isNaN(signedAt)) return false
    const now = (expected.now ?? new Date()).getTime()
    if (signedAt > now + CLOCK_SKEW_MS) return false
    if (now - signedAt > (expected.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return false

    const pub = hexToBytesStrict(assertion.identityPub, 32)
    const sig = hexToBytesStrict(signature, 64)
    return verify(encodeAssertion(assertion), sig, pub)
  } catch {
    return false
  }
}

/** The MXID subject for a verified assertion. */
export function subjectFor(assertion: IdentityAssertion): string {
  return matrixLocalpart(hexToBytesStrict(assertion.identityPub, 32))
}
