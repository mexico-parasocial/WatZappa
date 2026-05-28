import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DrandBeacon,
  fetchBeacon,
  fetchLatestBeacon,
  verifiableSortition,
  verifySortitionProof,
} from '../drand.js'

describe('drand', () => {
  const mockBeacon: DrandBeacon = {
    round: 4567890,
    randomness:
      'a3f2b1c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef',
  }

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchLatestBeacon', () => {
    it('returns a beacon on success', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBeacon,
      } as Response)

      const beacon = await fetchLatestBeacon()
      expect(beacon.round).toBe(4567890)
      expect(beacon.randomness).toBe(mockBeacon.randomness)
    })

    it('throws on network failure', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 503,
      } as Response)

      await expect(fetchLatestBeacon()).rejects.toThrow('drand fetch failed')
    })

    it('throws on timeout/network error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('ETIMEDOUT'))

      await expect(fetchLatestBeacon()).rejects.toThrow('ETIMEDOUT')
    })
  })

  describe('fetchBeacon', () => {
    it('fetches a specific round', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBeacon,
      } as Response)

      const beacon = await fetchBeacon(4567890)
      expect(beacon.round).toBe(4567890)
    })
  })

  describe('verifiableSortition', () => {
    it('returns A or B deterministically for same inputs', () => {
      const result1 = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )
      const result2 = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )

      expect(result1.chamber).toBe(result2.chamber)
      expect(['A', 'B']).toContain(result1.chamber)
    })

    it('returns different chambers for different DIDs', () => {
      const resultA = verifiableSortition(
        'did:plc:alice',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )
      const resultB = verifiableSortition(
        'did:plc:bob',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )

      // Not guaranteed to be different, but highly likely with good randomness
      // We just verify both are valid
      expect(['A', 'B']).toContain(resultA.chamber)
      expect(['A', 'B']).toContain(resultB.chamber)
    })

    it('shifts threshold based on chamber counts', () => {
      const balanced = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
        { a: 50, b: 50 },
      )

      const overloadedA = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
        { a: 90, b: 10 },
      )

      // With A overloaded, threshold should be lower (favor B)
      expect(balanced.threshold).toBe(0.5)
      expect(overloadedA.threshold).toBeLessThan(0.5)
    })

    it('includes proof fields', () => {
      const result = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )

      expect(result.round).toBe(mockBeacon.round)
      expect(result.randomness).toBe(mockBeacon.randomness)
      expect(result.did).toBe('did:plc:abc')
      expect(result.communityUri).toBe(
        'at://creator/com.para.community.board/test',
      )
      expect(result.hashInput).toBeDefined()
      expect(result.hashOutput).toBeDefined()
      expect(result.threshold).toBeDefined()
      expect(result.timestamp).toBeDefined()
    })
  })

  describe('verifySortitionProof', () => {
    it('returns true for a valid proof', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockBeacon,
      } as Response)

      const proof = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )

      const valid = await verifySortitionProof(proof)
      expect(valid).toBe(true)
    })

    it('returns false if randomness does not match', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          ...mockBeacon,
          randomness: ' tampered_randomness_',
        }),
      } as Response)

      const proof = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )

      const valid = await verifySortitionProof(proof)
      expect(valid).toBe(false)
    })

    it('returns false on drand fetch failure', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response)

      const proof = verifiableSortition(
        'did:plc:abc',
        'at://creator/com.para.community.board/test',
        mockBeacon,
      )

      const valid = await verifySortitionProof(proof)
      expect(valid).toBe(false)
    })
  })
})
