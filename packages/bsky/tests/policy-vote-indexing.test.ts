// @ts-nocheck
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TID, cidForCbor } from '@atproto/common'
import { type SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// A `com.para.civic.vote` carrying `subjectType: 'policy'` and a `signal`
// publishes a -3..+3 position in the voter's own repo, which OD-7 §5d refuses
// until the replacement ballot exists. This pins both halves of that refusal:
// our own PDS will not write one, and the AppView will not index one that
// reaches it from somewhere else.
maybeDescribe('policy votes are refused', () => {
  let network: TestNetwork
  let sc: SeedClient
  let db: any

  const policyVote = (subject: string) => ({
    $type: 'com.para.civic.vote',
    subject,
    subjectType: 'policy',
    signal: 2,
    isDirect: true,
    voteNullifier: 'm8-policy-shared-person',
    createdAt: new Date().toISOString(),
  })

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

  it('the PDS refuses to write one', async () => {
    const subject = `at://${sc.dids.alice}/com.para.civic.policy/refused-on-write`
    const attempt = sc.agent.com.atproto.repo.createRecord(
      {
        repo: sc.dids.alice,
        collection: 'com.para.civic.vote',
        record: policyVote(subject),
      },
      { encoding: 'application/json', headers: sc.getHeaders(sc.dids.alice) },
    )
    await expect(attempt).rejects.toThrow(/accepted only as a cabildeo ballot/)
  })

  it('the AppView refuses to index one reaching it from elsewhere', async () => {
    const subject = `at://${sc.dids.alice}/com.para.civic.policy/refused-on-index`
    const record = policyVote(subject)

    await network.bsky.sub.indexingSvc.indexRecord(
      AtUri.make(sc.dids.alice, 'com.para.civic.vote', TID.nextStr()),
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      new Date().toISOString(),
    )

    const rows = await db.db
      .selectFrom('para_policy_vote')
      .selectAll()
      .where('subject', '=', subject)
      .execute()

    expect(rows).toHaveLength(0)
  })
})
