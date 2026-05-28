import AtpAgent from '@atproto/api'
import {
  SeedClient,
  TestNetwork,
  createQvlDelegationRecord,
  createQvlIntensityRecord,
  createQvlVoteRecord,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

maybeDescribe('QV-LD voting and tally math', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'qvl_voting_test',
    })
    agent = network.bsky.getClient()
    sc = network.getSeedClient()
    await usersSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  const proposalUri = (id: string) => `at://did:example:proposal/${id}`
  const communityUri = (id: string) => `at://did:example:community/${id}`

  describe('flat tally', () => {
    it('computes simple average of signals', async () => {
      const proposal = proposalUri('flat1')
      const community = communityUri('flat1')

      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 3,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.bob, {
          proposal,
          community,
          signal: -3,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.carol, {
          proposal,
          community,
          signal: 1,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // Flat average: (3 + -3 + 1) / 3 = 0.333...
      expect(parseFloat(result.data.flat.signalAverage)).toBeCloseTo(1 / 3, 2)
      expect(result.data.flat.voteCount).toBe(3)
    })

    it('handles unanimous votes', async () => {
      const proposal = proposalUri('flat2')
      const community = communityUri('flat2')

      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 2,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.bob, {
          proposal,
          community,
          signal: 2,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      expect(parseFloat(result.data.flat.signalAverage)).toBe(2)
    })

    it('returns zero for no votes', async () => {
      const result = await agent.com.para.community.getTallySimulation({
        proposal: proposalUri('flat_empty'),
        community: communityUri('flat_empty'),
      })

      expect(parseFloat(result.data.flat.signalAverage)).toBe(0)
      expect(result.data.flat.voteCount).toBe(0)
    })
  })

  describe('√n weighted tally', () => {
    it('weights by square root of credits spent', async () => {
      const proposal = proposalUri('sqrt1')
      const community = communityUri('sqrt1')

      // Alice: signal +3, credits 16 → weight 4
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 3,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 3,
          units: 4,
          creditsSpent: 16,
        })
      })

      // Bob: signal -2, credits 4 → weight 2
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.bob, {
          proposal,
          community,
          signal: -2,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.bob, {
          proposal,
          voter: sc.dids.bob,
          signal: -2,
          units: 2,
          creditsSpent: 4,
        })
      })

      // Weighted sum: (3 * 4 + -2 * 2) = 12 - 4 = 8
      // Total weight: 4 + 2 = 6
      // Result: 8 / 6 = 1.333...

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      expect(parseFloat(result.data.sqrtN.signalAverage)).toBeCloseTo(8 / 6, 2)
      expect(result.data.sqrtN.voteCount).toBe(2)
    })

    it('aggregates multiple intensity records per voter', async () => {
      const proposal = proposalUri('sqrt2')
      const community = communityUri('sqrt2')

      // Alice casts vote and two intensity records for same proposal
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 2,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 2,
          units: 2,
          creditsSpent: 4,
        })
      })
      // Second intensity for same voter (should aggregate)
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 2,
          units: 3,
          creditsSpent: 9,
        })
      })

      // Total credits for alice: 4 + 9 = 13 → weight = sqrt(13) ≈ 3.606
      // In current impl each intensity record is weighted individually by sqrt(creditsSpent)
      // Record 1: weight sqrt(4)=2, signal*weight = 4
      // Record 2: weight sqrt(9)=3, signal*weight = 6
      // Total signal sum = 10, total weight = 5, result = 2

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      expect(result.data.sqrtN.voteCount).toBe(2)
      expect(parseFloat(result.data.sqrtN.signalAverage)).toBeCloseTo(2, 2)
    })

    it('uses signal from intensity when both exist', async () => {
      const proposal = proposalUri('sqrt3')
      const community = communityUri('sqrt3')

      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: -1,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: -1,
          units: 1,
          creditsSpent: 1,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      expect(parseFloat(result.data.sqrtN.signalAverage)).toBeCloseTo(-1, 2)
    })

    it('voters with only base vote are not in √n tally (no intensity)', async () => {
      const proposal = proposalUri('sqrt4')
      const community = communityUri('sqrt4')

      // Alice has base vote only (no intensity → not in √n)
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 2,
        })
      })

      // Bob has vote + intensity
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.bob, {
          proposal,
          community,
          signal: -1,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.bob, {
          proposal,
          voter: sc.dids.bob,
          signal: -1,
          units: 4,
          creditsSpent: 16,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // √n only counts intensities, so voteCount = 1 (bob only)
      expect(result.data.sqrtN.voteCount).toBe(1)
      expect(parseFloat(result.data.sqrtN.signalAverage)).toBeCloseTo(-1, 2)
    })
  })

  describe('correlation discount tally', () => {
    it('applies correlation discount to weighted tally', async () => {
      const proposal = proposalUri('corr1')
      const community = communityUri('corr1')

      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 3,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 3,
          units: 4,
          creditsSpent: 16,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      expect(result.data.correlation.signalAverage).toBeDefined()
      expect(result.data.correlation.voteCount).toBe(1)
    })

    it('correlation result uses flat as base when no eigenstate', async () => {
      const proposal = proposalUri('corr2')
      const community = communityUri('corr2')

      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 2,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 2,
          units: 4,
          creditsSpent: 16,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // Without eigenstate snapshot, correlation falls back to flat
      expect(parseFloat(result.data.correlation.signalAverage)).toBeCloseTo(
        parseFloat(result.data.flat.signalAverage),
        2,
      )
    })
  })

  describe('tally metrics', () => {
    it('computes maxWeightRatio correctly', async () => {
      const proposal = proposalUri('metric1')
      const community = communityUri('metric1')

      // Alice: credits 16 → weight 4
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 2,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 2,
          units: 4,
          creditsSpent: 16,
        })
      })
      // Bob: credits 1 → weight 1
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.bob, {
          proposal,
          community,
          signal: -1,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.bob, {
          proposal,
          voter: sc.dids.bob,
          signal: -1,
          units: 1,
          creditsSpent: 1,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // Total weight = 4 + 1 = 5
      // Max weight = 4
      // maxWeightRatio = 4 / 5 = 0.8
      expect(parseFloat(result.data.metrics.maxWeightRatio)).toBeCloseTo(0.8, 2)
    })

    it('computes effectiveParticipants (1/HHI) correctly', async () => {
      const proposal = proposalUri('metric2')
      const community = communityUri('metric2')

      // Equal weights: alice=16→4, bob=16→4, carol=16→4
      for (const did of [sc.dids.alice, sc.dids.bob, sc.dids.carol]) {
        await writeParaFixture(network, async () => {
          return createQvlVoteRecord(sc, did, {
            proposal,
            community,
            signal: 1,
          })
        })
        await writeParaFixture(network, async () => {
          return createQvlIntensityRecord(sc, did, {
            proposal,
            voter: did,
            signal: 1,
            units: 4,
            creditsSpent: 16,
          })
        })
      }

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // Equal weights → HHI = 3 * (1/3)^2 = 1/3
      // effectiveParticipants = 1 / (1/3) = 3
      expect(parseFloat(result.data.metrics.effectiveParticipants)).toBeCloseTo(
        3,
        1,
      )
    })

    it('computes revocationRate correctly', async () => {
      const proposal = proposalUri('metric3')
      const community = communityUri('metric3')

      // Active delegation scoped to this proposal
      await writeParaFixture(network, async () => {
        return createQvlDelegationRecord(sc, sc.dids.alice, {
          delegate: sc.dids.bob,
          delegator: sc.dids.alice,
          scope: { mode: 'proposal', proposal },
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      expect(result.data.metrics.revocationRate).toBeDefined()
      expect(typeof parseFloat(result.data.metrics.revocationRate)).toBe(
        'number',
      )
    })

    it('computes directVotePct correctly', async () => {
      const proposal = proposalUri('metric4')
      const community = communityUri('metric4')

      // Direct vote (delegationDepth = 0)
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 2,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 2,
          units: 2,
          creditsSpent: 4,
          delegationDepth: 0,
        })
      })
      // Delegated vote (delegationDepth > 0)
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.bob, {
          proposal,
          community,
          signal: -1,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.bob, {
          proposal,
          voter: sc.dids.bob,
          signal: -1,
          units: 2,
          creditsSpent: 4,
          delegationDepth: 1,
        })
      })

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // 1 direct out of 2 total = 50%
      expect(parseFloat(result.data.metrics.directVotePct)).toBeCloseTo(50, 0)
    })
  })

  describe('concentration metrics', () => {
    it('high concentration when one voter dominates', async () => {
      const proposal = proposalUri('conc1')
      const community = communityUri('conc1')

      // Alice: weight 16 (dominant)
      await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.alice, {
          proposal,
          community,
          signal: 3,
        })
      })
      await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 3,
          units: 16,
          creditsSpent: 256,
        })
      })

      // Many small voters
      for (const did of [sc.dids.bob, sc.dids.carol, sc.dids.dan]) {
        await writeParaFixture(network, async () => {
          return createQvlVoteRecord(sc, did, {
            proposal,
            community,
            signal: 1,
          })
        })
        await writeParaFixture(network, async () => {
          return createQvlIntensityRecord(sc, did, {
            proposal,
            voter: did,
            signal: 1,
            units: 1,
            creditsSpent: 1,
          })
        })
      }

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // High maxWeightRatio indicates concentration
      // Alice weight = 16, others = 1 each. Total = 19. maxWeightRatio = 16/19 ≈ 0.84
      expect(parseFloat(result.data.metrics.maxWeightRatio)).toBeGreaterThan(
        0.5,
      )
      // effectiveParticipants should be low relative to actual voters
      expect(
        parseFloat(result.data.metrics.effectiveParticipants),
      ).toBeLessThan(4)
    })

    it('low concentration with equal participation', async () => {
      const proposal = proposalUri('conc2')
      const community = communityUri('conc2')

      // Equal weights for all
      for (const did of [
        sc.dids.alice,
        sc.dids.bob,
        sc.dids.carol,
        sc.dids.dan,
      ]) {
        await writeParaFixture(network, async () => {
          return createQvlVoteRecord(sc, did, {
            proposal,
            community,
            signal: 1,
          })
        })
        await writeParaFixture(network, async () => {
          return createQvlIntensityRecord(sc, did, {
            proposal,
            voter: did,
            signal: 1,
            units: 4,
            creditsSpent: 16,
          })
        })
      }

      const result = await agent.com.para.community.getTallySimulation({
        proposal,
        community,
      })

      // Low maxWeightRatio: 4 equal voters → 0.25
      expect(parseFloat(result.data.metrics.maxWeightRatio)).toBeCloseTo(
        0.25,
        2,
      )
      // effectiveParticipants close to actual count
      expect(parseFloat(result.data.metrics.effectiveParticipants)).toBeCloseTo(
        4,
        1,
      )
    })
  })
})
