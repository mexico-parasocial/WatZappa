import { SeedClient, TestNetwork, usersSeed, writeParaFixture } from '@atproto/dev-env'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

maybeDescribe('policy vote indexing', () => {
  let network: TestNetwork
  let sc: SeedClient
  let db: any

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'policy_vote_indexing_test',
    })
    sc = network.getSeedClient()
    db = network.bsky.db
    await usersSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('deduplicates policy votes by m8 vote nullifier', async () => {
    const subject = `at://${sc.dids.alice}/com.para.civic.policy/one-person-one-vote`
    const voteNullifier = 'm8-policy-shared-person'

    await writeParaFixture(network, async () => {
      return createPolicyVoteRecord(sc, sc.dids.alice, {
        subject,
        signal: 2,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:policy-alice',
      })
    })
    await writeParaFixture(network, async () => {
      return createPolicyVoteRecord(sc, sc.dids.bob, {
        subject,
        signal: -2,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:policy-bob',
      })
    })

    const rows = await db.db
      .selectFrom('para_policy_vote')
      .selectAll()
      .where('subjectType', '=', 'policy')
      .where('subject', '=', subject)
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.bob)
    expect(rows[0].signal).toBe(-2)
  })
})

const createPolicyVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    subject: string
    signal: number
    voteNullifier?: string
    eligibilityProofRef?: string
  },
) => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: 'com.para.civic.vote',
      record: {
        $type: 'com.para.civic.vote',
        subject: opts.subject,
        subjectType: 'policy',
        signal: opts.signal,
        isDirect: true,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    { encoding: 'application/json', headers: sc.getHeaders(by) },
  )
  return { uri: data.uri, cid: data.cid }
}
