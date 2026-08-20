import { describe, expect, it, vi } from 'vitest'
import {
  AI_CONSENT_POLICY_VERSION,
  filterConsentedCards,
  hasAiConsent,
} from '../ai-consent.js'

/**
 * Boundary suite for OD-3 / F5 (docs/MATRIX_V2.md).
 *
 * These tests pin the property the feature exists to provide: text belonging to
 * a member who has not consented must never be included in what is sent to a
 * third-party LLM provider. They are written against the filter rather than the
 * endpoints because the filter is the single chokepoint every provider-bound
 * path is required to use.
 */

/** Stub DB honouring only the consent methods the filter touches. */
function dbWith(
  consenting: string[],
  policyVersion = AI_CONSENT_POLICY_VERSION,
) {
  return {
    getConsentingDids: vi.fn(async (dids: string[], required: number) => {
      if (policyVersion < required) return new Set<string>()
      return new Set(dids.filter((d) => consenting.includes(d)))
    }),
    getAiConsent: vi.fn(async (did: string) => ({
      did,
      granted: consenting.includes(did),
      policyVersion,
      grantedAt: consenting.includes(did) ? '2026-01-01T00:00:00Z' : null,
      revokedAt: null,
    })),
  } as any
}

const card = (id: string, author: string) => ({
  id,
  author_did: author,
  title: `card ${id}`,
  content: 'text',
})

describe('AI processing consent — filterConsentedCards', () => {
  it('keeps only cards whose author consented', async () => {
    const db = dbWith(['did:plc:alice'])
    const result = await filterConsentedCards(db, [
      card('1', 'did:plc:alice'),
      card('2', 'did:plc:bob'),
    ])

    expect(result.allowed.map((c) => c.id)).toEqual(['1'])
    expect(result.withheld).toBe(1)
  })

  it("does not export a non-consenting member's text because someone else consented", async () => {
    // The reason consent cannot be a property of the caller: a summary spans
    // many authors, so one member opting in must not carry the rest with them.
    const db = dbWith(['did:plc:alice'])
    const result = await filterConsentedCards(db, [
      card('1', 'did:plc:alice'),
      card('2', 'did:plc:bob'),
      card('3', 'did:plc:carol'),
    ])

    const authors = result.allowed.map((c) => c.author_did)
    expect(authors).not.toContain('did:plc:bob')
    expect(authors).not.toContain('did:plc:carol')
    expect(result.withheld).toBe(2)
  })

  it('withholds everything when nobody consented', async () => {
    const db = dbWith([])
    const result = await filterConsentedCards(db, [
      card('1', 'did:plc:alice'),
      card('2', 'did:plc:bob'),
    ])

    expect(result.allowed).toEqual([])
    expect(result.withheld).toBe(2)
  })

  it('withholds cards with no identifiable author', async () => {
    const db = dbWith(['did:plc:alice'])
    const result = await filterConsentedCards(db, [
      { id: '1', author_did: null, title: 't', content: 'c' },
      { id: '2', author_did: '', title: 't', content: 'c' },
    ])

    expect(result.allowed).toEqual([])
    expect(result.withheld).toBe(2)
  })

  it('treats consent recorded against an older disclosure as expired', async () => {
    // Consent to a previous disclosure is not consent to the current one.
    const db = dbWith(['did:plc:alice'], AI_CONSENT_POLICY_VERSION - 1)
    const result = await filterConsentedCards(db, [card('1', 'did:plc:alice')])

    expect(result.allowed).toEqual([])
    expect(result.withheld).toBe(1)
  })

  it('asks for consent at the current policy version, not any version', async () => {
    const db = dbWith(['did:plc:alice'])
    await filterConsentedCards(db, [card('1', 'did:plc:alice')])

    expect(db.getConsentingDids).toHaveBeenCalledWith(
      ['did:plc:alice'],
      AI_CONSENT_POLICY_VERSION,
    )
  })

  it('makes no database call for an empty card list', async () => {
    const db = dbWith(['did:plc:alice'])
    const result = await filterConsentedCards(db, [])

    expect(result).toEqual({ allowed: [], withheld: 0 })
    expect(db.getConsentingDids).not.toHaveBeenCalled()
  })

  it('propagates a lookup failure instead of sending unfiltered text', async () => {
    // Fail-closed: if consent cannot be determined the caller must abort, never
    // fall through to sending everything.
    const db = {
      getConsentingDids: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
    } as any

    await expect(
      filterConsentedCards(db, [card('1', 'did:plc:alice')]),
    ).rejects.toThrow('database unavailable')
  })
})

describe('AI processing consent — hasAiConsent', () => {
  it('is false for a member who never answered', async () => {
    const db = dbWith([])
    expect(await hasAiConsent(db, 'did:plc:bob')).toBe(false)
  })

  it('is true for a member who consented at the current version', async () => {
    const db = dbWith(['did:plc:alice'])
    expect(await hasAiConsent(db, 'did:plc:alice')).toBe(true)
  })

  it('is false when the stored consent predates the current disclosure', async () => {
    const db = dbWith(['did:plc:alice'], AI_CONSENT_POLICY_VERSION - 1)
    expect(await hasAiConsent(db, 'did:plc:alice')).toBe(false)
  })
})
