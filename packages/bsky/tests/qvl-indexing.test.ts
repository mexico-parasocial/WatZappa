import AtpAgent from '@atproto/api'
import { TID, cidForCbor } from '@atproto/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import {
  SeedClient,
  TestNetwork,
  createQvlDelegationRecord,
  createQvlDeliberationRecord,
  createQvlDeliberationVoteRecord,
  createQvlIntensityRecord,
  createQvlVoteRecord,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

maybeDescribe('QV-LD indexing', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient
  let db: any

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'qvl_indexing_test',
    })
    agent = network.bsky.getClient()
    sc = network.getSeedClient()
    db = network.bsky.db
    await usersSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('indexes a vote record into para_qvld_vote', async () => {
    const proposal = 'at://did:example:proposal/123'
    const community = 'at://did:example:community/456'
    const voteRef = await writeParaFixture(network, async () => {
      return createQvlVoteRecord(sc, sc.dids.alice, {
        proposal,
        community,
        signal: 2,
      })
    })

    const row = await db.db
      .selectFrom('para_qvld_vote')
      .selectAll()
      .where('uri', '=', voteRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.alice)
    expect(row?.proposal).toBe(proposal)
    expect(row?.community).toBe(community)
    expect(row?.signal).toBe(2)
    expect(row?.indexedAt).toBeDefined()
  })

  it('updates an existing vote on duplicate (upsert)', async () => {
    const proposal = 'at://did:example:proposal/upsert'
    const community = 'at://did:example:community/upsert'

    await writeParaFixture(network, async () => {
      return createQvlVoteRecord(sc, sc.dids.alice, {
        proposal,
        community,
        signal: 1,
      })
    })

    // Same proposal, different signal
    const voteRef2 = await writeParaFixture(network, async () => {
      return createQvlVoteRecord(sc, sc.dids.alice, {
        proposal,
        community,
        signal: -2,
      })
    })

    const rows = await db.db
      .selectFrom('para_qvld_vote')
      .selectAll()
      .where('creator', '=', sc.dids.alice)
      .where('proposal', '=', proposal)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].signal).toBe(-2)
    expect(rows[0].uri).toBe(voteRef2.uri) // uri updated to latest
  })

  it('deduplicates community votes by m8 vote nullifier', async () => {
    const proposal = 'at://did:example:proposal/nullifier-vote'
    const community = 'at://did:example:community/nullifier-vote'
    const voteNullifier = 'm8-qvl-vote-shared-person'

    await writeParaFixture(network, async () => {
      return createQvlVoteRecord(sc, sc.dids.alice, {
        proposal,
        community,
        signal: 1,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:qvl-vote-alice',
      })
    })
    await writeParaFixture(network, async () => {
      return createQvlVoteRecord(sc, sc.dids.bob, {
        proposal,
        community,
        signal: -3,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:qvl-vote-bob',
      })
    })

    const rows = await db.db
      .selectFrom('para_qvld_vote')
      .selectAll()
      .where('proposal', '=', proposal)
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.bob)
    expect(rows[0].signal).toBe(-3)
  })

  it('indexes an intensity record into para_qvld_intensity', async () => {
    const proposal = 'at://did:example:proposal/intensity'
    const intensityRef = await writeParaFixture(network, async () => {
      return createQvlIntensityRecord(sc, sc.dids.bob, {
        proposal,
        voter: sc.dids.bob,
        signal: -1,
        units: 4,
        creditsSpent: 16,
        delegatedFrom: [sc.dids.alice],
        delegationDepth: 1,
        effectiveWeight: '4.0',
      })
    })

    const row = await db.db
      .selectFrom('para_qvld_intensity')
      .selectAll()
      .where('uri', '=', intensityRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.bob)
    expect(row?.proposal).toBe(proposal)
    expect(row?.signal).toBe(-1)
    expect(row?.units).toBe(4)
    expect(row?.creditsSpent).toBe(16)
    expect(row?.delegatedFrom).toEqual([sc.dids.alice])
    expect(row?.delegationDepth).toBe(1)
    expect(row?.effectiveWeight).toBe('4.0')
  })

  it('deduplicates community intensity declarations by m8 vote nullifier', async () => {
    const proposal = 'at://did:example:proposal/nullifier-intensity'
    const voteNullifier = 'm8-qvl-intensity-shared-person'

    await writeParaFixture(network, async () => {
      return createQvlIntensityRecord(sc, sc.dids.alice, {
        proposal,
        voter: sc.dids.alice,
        signal: 1,
        units: 1,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:qvl-intensity-alice',
      })
    })
    await writeParaFixture(network, async () => {
      return createQvlIntensityRecord(sc, sc.dids.bob, {
        proposal,
        voter: sc.dids.bob,
        signal: 1,
        units: 16,
        creditsSpent: 16,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:qvl-intensity-bob',
      })
    })

    const rows = await db.db
      .selectFrom('para_qvld_intensity')
      .selectAll()
      .where('proposal', '=', proposal)
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.bob)
    expect(rows[0].units).toBe(16)
    expect(rows[0].creditsSpent).toBe(16)
  })

  it('indexes a delegation record into para_qvld_delegation', async () => {
    const delegationRef = await writeParaFixture(network, async () => {
      return createQvlDelegationRecord(sc, sc.dids.carol, {
        delegate: sc.dids.dan,
        delegator: sc.dids.carol,
        delegateRole: 'representative',
        party: 'green',
        scope: {
          mode: 'community',
          community: 'at://did:example:community/delegation',
          topic: 'general',
        },
      })
    })

    const row = await db.db
      .selectFrom('para_qvld_delegation')
      .selectAll()
      .where('uri', '=', delegationRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.delegate).toBe(sc.dids.dan)
    expect(row?.delegator).toBe(sc.dids.carol)
    expect(row?.delegateRole).toBe('representative')
    expect(row?.party).toBe('green')
    expect(row?.scopeMode).toBe('community')
    expect(row?.scopeCommunity).toBe('at://did:example:community/delegation')
    expect(row?.scopeTopic).toBe('general')
    expect(row?.revokedAt).toBeNull()
  })

  it('indexes a deliberation record into para_qvld_deliberation_statement', async () => {
    const proposal = 'at://did:example:proposal/deliberation'
    const community = 'at://did:example:community/deliberation'
    const deliberationRef = await writeParaFixture(network, async () => {
      return createQvlDeliberationRecord(sc, sc.dids.dan, {
        proposal,
        community,
        body: 'I think this proposal has merit because...',
        stance: 'for',
      })
    })

    const row = await db.db
      .selectFrom('para_qvld_deliberation_statement')
      .selectAll()
      .where('uri', '=', deliberationRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.dan)
    expect(row?.proposal).toBe(proposal)
    expect(row?.body).toBe('I think this proposal has merit because...')
    expect(row?.stance).toBe('supportive')
    expect(row?.indexedAt).toBeDefined()
  })

  it('indexes a deliberation vote record into para_qvld_deliberation_vote', async () => {
    const deliberation = 'at://did:example:deliberation/123'
    const voteRef = await writeParaFixture(network, async () => {
      return createQvlDeliberationVoteRecord(sc, sc.dids.alice, {
        deliberation,
        voter: sc.dids.alice,
        direction: 'agree',
      })
    })

    const row = await db.db
      .selectFrom('para_qvld_deliberation_vote')
      .selectAll()
      .where('uri', '=', voteRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.alice)
    expect(row?.statement).toBe(deliberation)
    expect(row?.voter).toBe(sc.dids.alice)
    expect(row?.vote).toBe('agree')
    expect(row?.indexedAt).toBeDefined()
  })

  it('upserts deliberation votes by (creator, deliberation)', async () => {
    const deliberation = 'at://did:example:deliberation/upsert'

    await writeParaFixture(network, async () => {
      return createQvlDeliberationVoteRecord(sc, sc.dids.bob, {
        deliberation,
        voter: sc.dids.bob,
        direction: 'agree',
      })
    })

    await writeParaFixture(network, async () => {
      return createQvlDeliberationVoteRecord(sc, sc.dids.bob, {
        deliberation,
        voter: sc.dids.bob,
        direction: 'disagree',
      })
    })

    const rows = await db.db
      .selectFrom('para_qvld_deliberation_vote')
      .selectAll()
      .where('creator', '=', sc.dids.bob)
      .where('statement', '=', deliberation)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].vote).toBe('disagree')
  })

  it('deduplicates deliberation votes by m8 vote nullifier', async () => {
    const deliberation = `at://${sc.dids.alice}/com.para.community.deliberation/nullifier`
    const voteNullifier = 'm8-qvl-deliberation-shared-person'

    await indexDeliberationVote(sc.dids.alice, {
      $type: 'com.para.community.deliberationVote',
      deliberation,
      voter: sc.dids.alice,
      direction: 'agree',
      voteNullifier,
      eligibilityProofRef: 'm8:civic-vote-proof:qvl-delib-alice',
      createdAt: new Date().toISOString(),
    })
    await indexDeliberationVote(sc.dids.bob, {
      $type: 'com.para.community.deliberationVote',
      deliberation,
      voter: sc.dids.bob,
      direction: 'pass',
      voteNullifier,
      eligibilityProofRef: 'm8:civic-vote-proof:qvl-delib-bob',
      createdAt: new Date().toISOString(),
    })

    async function indexDeliberationVote(
      did: string,
      record: {
        $type: 'com.para.community.deliberationVote'
        deliberation: string
        voter: string
        direction: 'agree' | 'disagree' | 'pass'
        voteNullifier: string
        eligibilityProofRef: string
        createdAt: string
      },
    ) {
      await network.bsky.sub.indexingSvc.indexRecord(
        AtUri.make(did, 'com.para.community.deliberationVote', TID.nextStr()),
        await cidForCbor(record),
        record,
        WriteOpAction.Create,
        new Date().toISOString(),
      )
    }

    const rows = await db.db
      .selectFrom('para_qvld_deliberation_vote')
      .selectAll()
      .where('statement', '=', deliberation)
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.bob)
    expect(rows[0].vote).toBe('pass')
  })

  it('unindexes actor removes all QV-LD records', async () => {
    // Create records for alice
    const proposal = 'at://did:example:proposal/unindex'
    const community = 'at://did:example:community/unindex'
    const deliberation = 'at://did:example:deliberation/unindex'

    const voteRef = await writeParaFixture(network, async () => {
      return createQvlVoteRecord(sc, sc.dids.alice, {
        proposal,
        community,
        signal: 1,
      })
    })
    const intensityRef = await writeParaFixture(network, async () => {
      return createQvlIntensityRecord(sc, sc.dids.alice, {
        proposal,
        voter: sc.dids.alice,
        signal: 1,
        units: 2,
      })
    })
    const delegationRef = await writeParaFixture(network, async () => {
      return createQvlDelegationRecord(sc, sc.dids.alice, {
        delegate: sc.dids.bob,
        delegator: sc.dids.alice,
        scope: { mode: 'community', community },
      })
    })
    const deliberationRef = await writeParaFixture(network, async () => {
      return createQvlDeliberationRecord(sc, sc.dids.alice, {
        proposal,
        community,
        body: 'test',
      })
    })
    const delibVoteRef = await writeParaFixture(network, async () => {
      return createQvlDeliberationVoteRecord(sc, sc.dids.alice, {
        deliberation,
        voter: sc.dids.alice,
        direction: 'agree',
      })
    })

    // Verify they exist
    const voteExists = await db.db
      .selectFrom('para_qvld_vote')
      .select('uri')
      .where('uri', '=', voteRef.uri)
      .executeTakeFirst()
    expect(voteExists).toBeDefined()

    // Unindex alice
    const indexer = network.bsky.sub.indexingSvc
    await indexer.unindexActor(sc.dids.alice)

    // Verify all gone
    const voteGone = await db.db
      .selectFrom('para_qvld_vote')
      .select('uri')
      .where('uri', '=', voteRef.uri)
      .executeTakeFirst()
    const intensityGone = await db.db
      .selectFrom('para_qvld_intensity')
      .select('uri')
      .where('uri', '=', intensityRef.uri)
      .executeTakeFirst()
    const delegationGone = await db.db
      .selectFrom('para_qvld_delegation')
      .select('uri')
      .where('uri', '=', delegationRef.uri)
      .executeTakeFirst()
    const deliberationGone = await db.db
      .selectFrom('para_qvld_deliberation_statement')
      .select('uri')
      .where('uri', '=', deliberationRef.uri)
      .executeTakeFirst()
    const delibVoteGone = await db.db
      .selectFrom('para_qvld_deliberation_vote')
      .select('uri')
      .where('uri', '=', delibVoteRef.uri)
      .executeTakeFirst()

    expect(voteGone).toBeUndefined()
    expect(intensityGone).toBeUndefined()
    expect(delegationGone).toBeUndefined()
    expect(deliberationGone).toBeUndefined()
    expect(delibVoteGone).toBeUndefined()
  })

  describe('edge cases and constraints', () => {
    it('handles signal at boundaries (-3 and +3)', async () => {
      const proposal = 'at://did:example:proposal/bounds'
      const community = 'at://did:example:community/bounds'

      const negRef = await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.carol, {
          proposal,
          community,
          signal: -3,
        })
      })
      const posRef = await writeParaFixture(network, async () => {
        return createQvlVoteRecord(sc, sc.dids.dan, {
          proposal,
          community,
          signal: 3,
        })
      })

      const negRow = await db.db
        .selectFrom('para_qvld_vote')
        .selectAll()
        .where('uri', '=', negRef.uri)
        .executeTakeFirst()
      const posRow = await db.db
        .selectFrom('para_qvld_vote')
        .selectAll()
        .where('uri', '=', posRef.uri)
        .executeTakeFirst()

      expect(negRow?.signal).toBe(-3)
      expect(posRow?.signal).toBe(3)
    })

    it('handles units at boundaries (1 and 16)', async () => {
      const proposal = 'at://did:example:proposal/units'

      const minRef = await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.carol, {
          proposal,
          voter: sc.dids.carol,
          signal: 1,
          units: 1,
        })
      })
      const maxRef = await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.dan, {
          proposal,
          voter: sc.dids.dan,
          signal: 1,
          units: 16,
        })
      })

      const minRow = await db.db
        .selectFrom('para_qvld_intensity')
        .selectAll()
        .where('uri', '=', minRef.uri)
        .executeTakeFirst()
      const maxRow = await db.db
        .selectFrom('para_qvld_intensity')
        .selectAll()
        .where('uri', '=', maxRef.uri)
        .executeTakeFirst()

      expect(minRow?.units).toBe(1)
      expect(maxRow?.units).toBe(16)
    })

    it('handles delegation with minimal scope (mode only)', async () => {
      const delegationRef = await writeParaFixture(network, async () => {
        return createQvlDelegationRecord(sc, sc.dids.bob, {
          delegate: sc.dids.carol,
          delegator: sc.dids.bob,
          scope: { mode: 'community' },
        })
      })

      const row = await db.db
        .selectFrom('para_qvld_delegation')
        .selectAll()
        .where('uri', '=', delegationRef.uri)
        .executeTakeFirst()
      expect(row?.scopeMode).toBe('community')
      expect(row?.scopeCommunity).toBeNull()
      expect(row?.scopeTopic).toBeNull()
      expect(row?.scopeProposal).toBeNull()
    })

    it('handles null optional fields correctly', async () => {
      const proposal = 'at://did:example:proposal/nulls'
      const intensityRef = await writeParaFixture(network, async () => {
        return createQvlIntensityRecord(sc, sc.dids.alice, {
          proposal,
          voter: sc.dids.alice,
          signal: 0,
          units: 2,
        })
      })

      const row = await db.db
        .selectFrom('para_qvld_intensity')
        .selectAll()
        .where('uri', '=', intensityRef.uri)
        .executeTakeFirst()
      expect(row?.delegatedFrom).toBeNull()
      expect(row?.delegationDepth).toBeNull()
      expect(row?.effectiveWeight).toBeNull()
      expect(row?.creditsSpent).toBe(2) // default from factory
    })
  })
})
