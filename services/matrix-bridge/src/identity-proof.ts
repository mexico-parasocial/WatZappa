import { sha256 } from '@noble/hashes/sha2'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils'
import { verify } from '@scure/sr25519'

/*
 * Server side of the Matrix v2 identity boundary (CD-M1 / CD-M4).
 * Normative spec: WatZappa/docs/MATRIX_V2.md §4 and the decision records
 * CD-M1 (MXID derivation) and CD-M4 (proof of possession). The client-side
 * reference implementations are iM8/src/services/{matrixIdentity,identitySignature}.ts;
 * the encoding of every byte here must stay identical to them — MXIDs are
 * account names on a live homeserver, and an assertion the client signs must
 * verify here.
 *
 * The bridge never derives identity keys from seeds (that is client/identity-
 * manager power) and never learns which identity label a key belongs to. The
 * ballot-identity refusal (MATRIX_V2 §4, "which identities may have an
 * account") is enforced at signing time in iM8; the server-side boundary is
 * the absence of any DID↔MXID mapping — this module is the only place that
 * turns a public key into an MXID, and nothing here goes the other way.
 */

/** Domain separator for the localpart digest. Versioned wire format (CD-M1). */
export const DOMAIN_MATRIX_LOCALPART = 'para-id/matrix-localpart/v1'

/** Domain separator inside the signed assertion bytes. Must match iM8. */
export const DOMAIN_IDENTITY_SIG = 'para-id/sig/v1'

/** Digest bytes retained: 20 bytes = 160 bits = exactly 32 base32 chars. */
const LOCALPART_BYTES = 20

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/** The only localpart shape this bridge provisions. Pins the appservice namespace. */
export const MXID_LOCALPART_REGEX = /^[a-z2-7]{32}$/

/**
 * Audiences the bridge accepts, all under the `matrix-login` purpose. An
 * assertion signed for one audience never verifies for another: an identity
 * probe cannot be replayed as a session mint or a room join.
 */
export const BRIDGE_AUDIENCES = {
  identity: 'para-matrix-bridge/identity.v1',
  session: 'para-matrix-bridge/session.v1',
  join: 'para-matrix-bridge/join.v1',
  attest: 'para-matrix-bridge/attest.v1',
} as const

/** RFC 4648 base32, lowercased and unpadded — the Matrix localpart grammar
 *  allows only `[a-z0-9._=/+-]`, so uppercase base32 would be invalid. */
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
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return out
}

/**
 * localpart = base32_lower_nopad( SHA-256(DOMAIN ‖ identity_pub)[0..20] )
 *
 * A pure function of the identity public key. Nothing in this service can
 * invert it, and no other input produces an MXID.
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

export function mxidForIdentityPub(
  identityPub: Uint8Array,
  serverName: string,
): string {
  return `@${matrixLocalpart(identityPub)}:${serverName}`
}

/** The signed payload. Field order is canonical and must not be reordered. */
export interface IdentityAssertion {
  type: 'para.identity.pop.v1'
  purpose: string
  audience: string
  identityPub: string
  challenge: string
  signedAt: string
}

export interface SignedAssertion {
  assertion: IdentityAssertion
  /** 64-byte sr25519 signature, hex. */
  signature: string
}

/** Canonical encoding; byte-identical to iM8's encodeAssertion. */
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
 * Verify a proof of possession and derive the MXID it authorizes.
 *
 * Everything here runs on attacker-controlled input from a public endpoint:
 * shape is guarded before any field is touched, and any failure to verify,
 * for any reason (sr25519's verify() throws on malformed points rather than
 * returning false), is a rejection — never an exception.
 *
 * Replay protection is the caller's: the challenge must come from this
 * service's ChallengeStore and be consumed exactly once. `expected.purpose`
 * is 'matrix-login' for every audience the bridge defines.
 */
export function verifyIdentityAssertion(
  signed: SignedAssertion,
  expected: { purpose: string; audience: string; challenge: string },
): boolean {
  if (!signed || typeof signed !== 'object') return false
  const { assertion, signature } = signed as SignedAssertion
  if (!assertion || typeof assertion !== 'object') return false
  if (typeof signature !== 'string') return false
  if (assertion.type !== 'para.identity.pop.v1') return false
  if (assertion.purpose !== expected.purpose) return false
  if (assertion.audience !== expected.audience) return false
  if (assertion.challenge !== expected.challenge) return false

  try {
    const pub = hexToBytesStrict(assertion.identityPub, 32)
    const sig = hexToBytesStrict(signature, 64)
    return verify(encodeAssertion(assertion), sig, pub)
  } catch {
    return false
  }
}

/** Verify, then return the MXID the presented key authorizes on this
 *  homeserver. Returns null when the proof does not verify. */
export function mxidFromVerifiedAssertion(
  signed: SignedAssertion,
  expected: { purpose: string; audience: string; challenge: string },
  serverName: string,
): string | null {
  if (!verifyIdentityAssertion(signed, expected)) return null
  const localpart = matrixLocalpart(
    hexToBytesStrict(signed.assertion.identityPub, 32),
  )
  return `@${localpart}:${serverName}`
}

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
