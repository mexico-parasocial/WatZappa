import { sha256 } from '@noble/hashes/sha2'
import { describe, expect, it } from 'vitest'
import {
  BRIDGE_AUDIENCES,
  MXID_LOCALPART_REGEX,
  base32LowerNoPad,
  matrixLocalpart,
  mxidForIdentityPub,
  verifyIdentityAssertion,
} from '../identity-proof.js'
import {
  PINNED_LOCALPARTS,
  TEST_SERVER_NAME,
  deriveIdentity,
  signAssertion,
} from './helpers/identity.js'

const hexToBytes = (hex: string) =>
  new Uint8Array(hex.match(/../g)!.map((b) => Number.parseInt(b, 16)))

describe('base32LowerNoPad', () => {
  // RFC 4648 §10 test vectors, lowercased with padding stripped.
  for (const [input, expected] of [
    ['', ''],
    ['f', 'my'],
    ['fo', 'mzxq'],
    ['foo', 'mzxw6'],
    ['foob', 'mzxw6yq'],
    ['fooba', 'mzxw6ytb'],
    ['foobar', 'mzxw6ytboi'],
  ] as const) {
    it(`encodes ${JSON.stringify(input)} as ${JSON.stringify(expected)}`, () => {
      expect(base32LowerNoPad(new TextEncoder().encode(input))).toBe(expected)
    })
  }
})

describe('matrixLocalpart (CD-M1)', () => {
  it('matches the localparts pinned in iM8 for the shared seed vectors', () => {
    // Cross-repo compatibility: these exact localparts are the accounts the
    // prototype homeserver already knows. The bridge must agree with the
    // client-side derivation byte for byte or every user is renamed.
    for (const [seedHex, expected] of Object.entries(PINNED_LOCALPARTS)) {
      for (const label of ['public', 'anonymous'] as const) {
        const identity = deriveIdentity(hexToBytes(seedHex), label)
        expect(matrixLocalpart(identity.pub)).toBe(expected[label])
      }
    }
  })

  it('produces a localpart the Matrix historical grammar accepts', () => {
    const identity = deriveIdentity(
      hexToBytes(Object.keys(PINNED_LOCALPARTS)[1]),
      'public',
    )
    expect(matrixLocalpart(identity.pub)).toMatch(MXID_LOCALPART_REGEX)
  })

  it('is a pure function of the public key, not of the seed or label', () => {
    const a = deriveIdentity(hexToBytes('01'.repeat(32)), 'public')
    expect(matrixLocalpart(a.pub)).toBe(matrixLocalpart(a.pub.slice()))
  })

  it('is domain-separated: a naked sha256 of the key gives a different answer', () => {
    const identity = deriveIdentity(new Uint8Array(32), 'public')
    const nakedDigest = base32LowerNoPad(sha256(identity.pub))
    expect(matrixLocalpart(identity.pub)).not.toBe(nakedDigest.slice(0, 32))
  })

  it('rejects anything that is not a 32-byte public key', () => {
    expect(() => matrixLocalpart(new Uint8Array(31))).toThrow(/32 bytes/)
    expect(() => matrixLocalpart(new Uint8Array(33))).toThrow(/32 bytes/)
  })

  it('builds the MXID on the given server name', () => {
    const identity = deriveIdentity(new Uint8Array(32), 'public')
    expect(mxidForIdentityPub(identity.pub, TEST_SERVER_NAME)).toBe(
      `@k4o2lmcmitomgymtdb7y3htsthoofobo:${TEST_SERVER_NAME}`,
    )
  })
})

describe('verifyIdentityAssertion (CD-M4)', () => {
  const identity = deriveIdentity(hexToBytes('02'.repeat(32)), 'public')
  const input = {
    purpose: 'matrix-login',
    audience: BRIDGE_AUDIENCES.join,
    challenge: 'a'.repeat(64),
  }

  it('accepts a genuine proof', () => {
    expect(verifyIdentityAssertion(signAssertion(identity, input), input)).toBe(
      true,
    )
  })

  it('rejects a signature made for another audience', () => {
    const signed = signAssertion(identity, {
      ...input,
      audience: BRIDGE_AUDIENCES.session,
    })
    expect(verifyIdentityAssertion(signed, input)).toBe(false)
  })

  it('rejects a signature made for another purpose', () => {
    const signed = signAssertion(identity, {
      ...input,
      purpose: 'mubez-registration',
    })
    expect(verifyIdentityAssertion(signed, input)).toBe(false)
  })

  it('rejects a signature over a different challenge', () => {
    const signed = signAssertion(identity, input)
    expect(
      verifyIdentityAssertion(signed, { ...input, challenge: 'b'.repeat(64) }),
    ).toBe(false)
  })

  it('rejects a signature by a different key claiming the same pub', () => {
    const other = deriveIdentity(hexToBytes('03'.repeat(32)), 'public')
    const signed = signAssertion(other, input)
    // Swap in the victim's pub: signature must not verify.
    signed.assertion.identityPub = identity.pubHex
    expect(verifyIdentityAssertion(signed, input)).toBe(false)
  })

  it('rejects hostile shapes without throwing', () => {
    expect(verifyIdentityAssertion(null as never, input)).toBe(false)
    expect(verifyIdentityAssertion({} as never, input)).toBe(false)
    expect(
      verifyIdentityAssertion(
        { assertion: null, signature: 'x' } as never,
        input,
      ),
    ).toBe(false)
    expect(
      verifyIdentityAssertion(
        {
          assertion: { ...input, type: 'para.identity.pop.v2' },
          signature: '00'.repeat(64),
        } as never,
        input,
      ),
    ).toBe(false)
    const garbage = signAssertion(identity, input)
    garbage.signature = 'zz' + garbage.signature.slice(2)
    expect(verifyIdentityAssertion(garbage, input)).toBe(false)
  })
})
