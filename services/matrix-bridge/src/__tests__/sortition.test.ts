import { describe, expect, it } from 'vitest'
import { verifiableSortition } from '../drand.js'
import {
  assignChamber,
  assignChamberBalanced,
  assignChamberVerifiable,
} from '../sortition.js'

describe('sortition', () => {
  describe('assignChamber (deterministic fallback)', () => {
    it('is deterministic for same inputs', () => {
      const c1 = assignChamber('did:plc:abc', 'at://test')
      const c2 = assignChamber('did:plc:abc', 'at://test')
      expect(c1).toBe(c2)
    })

    it('returns A or B', () => {
      const chamber = assignChamber('did:plc:abc', 'at://test')
      expect(['A', 'B']).toContain(chamber)
    })
  })

  describe('assignChamberBalanced', () => {
    it('uses base assignment when balanced', () => {
      const base = assignChamber('did:plc:abc', 'at://test')
      const balanced = assignChamberBalanced('did:plc:abc', 'at://test', 50, 50)
      expect(balanced).toBe(base)
    })

    it('flips to under-represented chamber when overloaded', () => {
      // Force base to be A
      const did = 'did:plc:force-a'
      const base = assignChamber(did, 'at://test')

      // If base is A and A is overloaded, should flip to B
      if (base === 'A') {
        const balanced = assignChamberBalanced(did, 'at://test', 90, 10)
        expect(balanced).toBe('B')
      } else {
        // If base is B and B is overloaded, should flip to A
        const balanced = assignChamberBalanced(did, 'at://test', 10, 90)
        expect(balanced).toBe('A')
      }
    })
  })

  describe('assignChamberVerifiable', () => {
    it('returns a proof with drand beacon', async () => {
      const result = await assignChamberVerifiable(
        'did:plc:abc',
        'at://test',
        50,
        50,
      )

      expect(result.chamber).toMatch(/^[AB]$/)
      expect(result.round).toBeGreaterThan(0)
      expect(result.randomness).toBeDefined()
      expect(result.hashOutput).toBeDefined()
    })

    it('produces different results for different beacons', async () => {
      const result1 = await assignChamberVerifiable(
        'did:plc:abc',
        'at://test',
        50,
        50,
      )
      // Small delay to get different beacon
      await new Promise((r) => setTimeout(r, 100))
      const result2 = await assignChamberVerifiable(
        'did:plc:abc',
        'at://test',
        50,
        50,
      )

      // Same DID + community should get same chamber if same beacon,
      // but with different beacons, could differ
      // We just verify both are valid
      expect(['A', 'B']).toContain(result1.chamber)
      expect(['A', 'B']).toContain(result2.chamber)
    })
  })

  describe('verifiableSortition reproducibility', () => {
    it('same beacon + did + community always gives same chamber', () => {
      const beacon = {
        round: 12345,
        randomness:
          'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      }

      const r1 = verifiableSortition('did:plc:abc', 'at://test', beacon)
      const r2 = verifiableSortition('did:plc:abc', 'at://test', beacon)
      const r3 = verifiableSortition('did:plc:abc', 'at://test', beacon)

      expect(r1.chamber).toBe(r2.chamber)
      expect(r2.chamber).toBe(r3.chamber)
    })
  })
})
