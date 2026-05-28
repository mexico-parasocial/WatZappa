import { SeedClient, TestNetwork, usersSeed, writeParaFixture } from '@atproto/dev-env'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

maybeDescribe('open question vote indexing', () => {
  let network: TestNetwork
  let sc: SeedClient
  let db: any

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'open_question_vote_indexing_test',
    })
    sc = network.getSeedClient()
    db = network.bsky.db
    await usersSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('deduplicates open question votes by m8 vote nullifier', async () => {
    const subject = 'at://did:example:open-question/reply'
    const voteNullifier = 'm8-open-question-shared-person'

    await writeParaFixture(network, async () => {
      return createOpenQuestionVoteRecord(sc, sc.dids.alice, {
        subject,
        value: 1,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:open-alice',
      })
    })
    await writeParaFixture(network, async () => {
      return createOpenQuestionVoteRecord(sc, sc.dids.bob, {
        subject,
        value: -1,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:open-bob',
      })
    })

    const rows = await db.db
      .selectFrom('para_open_question_vote')
      .selectAll()
      .where('subject', '=', subject)
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.bob)
    expect(rows[0].value).toBe(-1)
  })
})

const createOpenQuestionVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    subject: string
    value: -1 | 0 | 1
    voteNullifier?: string
    eligibilityProofRef?: string
  },
) => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: 'com.para.civic.openQuestionVote',
      record: {
        $type: 'com.para.civic.openQuestionVote',
        subject: opts.subject,
        value: opts.value,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    { encoding: 'application/json', headers: sc.getHeaders(by) },
  )
  return { uri: data.uri, cid: data.cid }
}
