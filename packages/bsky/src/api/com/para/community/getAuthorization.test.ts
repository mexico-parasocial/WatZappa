import { describe, expect, it } from 'vitest'
import { resolveAuthoritySubject } from './getAuthorization.js'

const token = 'test-authority-service-token-32-characters'
describe('bridge authority credential scope', () => {
  it('keeps ordinary callers bound to themselves despite a supplied subject', () => {
    expect(
      resolveAuthoritySubject(
        'did:plc:member',
        'did:plc:owner',
        undefined,
        token,
      ),
    ).toBe('did:plc:member')
    expect(
      resolveAuthoritySubject(undefined, 'did:plc:owner', undefined, token),
    ).toBeUndefined()
  })
  it('permits the exact subject only with the configured service credential', () => {
    expect(
      resolveAuthoritySubject(undefined, 'did:plc:member', token, token),
    ).toBe('did:plc:member')
  })
  it.each([undefined, '', 'wrong-token', token.slice(1)])(
    'rejects absent or incorrect configuration/credential %s',
    (configured) => {
      expect(() =>
        resolveAuthoritySubject(undefined, 'did:plc:member', token, configured),
      ).toThrow('Invalid authority service credential')
    },
  )
  it('rejects duplicate headers and missing subjects', () => {
    expect(() =>
      resolveAuthoritySubject(
        undefined,
        'did:plc:member',
        [token, token],
        token,
      ),
    ).toThrow()
    expect(() =>
      resolveAuthoritySubject(undefined, undefined, token, token),
    ).toThrow()
  })
})
