// @ts-nocheck
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
  it('refuses foreign cabildeo records without issuer authorization', async () => {
    using transaction = vi.spyOn(network.bsky.sub.indexingSvc.db, 'transaction')
    const subject = `at://${sc.dids.alice}/com.para.civic.cabildeo/unverified`
    const record = {
      $type: 'com.para.civic.vote',
      subject,
      cabildeo: subject,
      subjectType: 'cabildeo',
      selectedOption: 1,
      isDirect: true,
      voteNullifier: 'invented',
      createdAt: new Date().toISOString(),
    }
    await network.bsky.sub.indexingSvc.indexRecord(
      AtUri.make(sc.dids.alice, record.$type, TID.nextStr()),
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      record.createdAt,
    )
    expect(transaction).not.toHaveBeenCalled()
    const rows = await db.db
      .selectFrom('cabildeo_vote')
      .selectAll()
      .where('cabildeo', '=', subject)
      .execute()
    expect(rows).toHaveLength(0)
  })

  it('does not silently drop an issuer outage as a valid or permanently invalid ballot', async () => {
    const previousUrl = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = 'https://issuer.invalid/verify'
    using request = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'))
    using transaction = vi.spyOn(network.bsky.sub.indexingSvc.db, 'transaction')
    const subject = `at://${sc.dids.alice}/com.para.civic.cabildeo/outage`
    const record = {
      $type: 'com.para.civic.vote',
      subject,
      cabildeo: subject,
      subjectType: 'cabildeo',
      selectedOption: 1,
      isDirect: true,
      voteNullifier: 'a'.repeat(64),
      eligibilityProofRef: 'm8:cabildeo:v1:' + 'b'.repeat(43),
      createdAt: new Date().toISOString(),
    }
    try {
      await expect(
        network.bsky.sub.indexingSvc.indexRecord(
          AtUri.make(sc.dids.alice, record.$type, TID.nextStr()),
          await cidForCbor(record),
          record,
          WriteOpAction.Create,
          record.createdAt,
        ),
      ).rejects.toThrow(/verification is unavailable/)
      expect(request).toHaveBeenCalledOnce()
      expect(transaction).not.toHaveBeenCalled()
    } finally {
      if (previousUrl === undefined)
        delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
      else process.env.PARA_CIVIC_VOTE_VERIFIER_URL = previousUrl
    }
  })

  it('refuses the civic delegation signal bypass from a foreign PDS', async () => {
    const record = {
      $type: 'com.para.civic.delegation',
      mode: 'active',
      cabildeo: `at://${sc.dids.alice}/com.para.civic.cabildeo/signal-bypass`,
      delegateTo: sc.dids.bob,
      reason: 'An otherwise indexable synthetic delegation',
      signal: 2,
      createdAt: new Date().toISOString(),
    }
    const uri = AtUri.make(sc.dids.alice, record.$type, TID.nextStr())
    await network.bsky.sub.indexingSvc.indexRecord(
      uri,
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      record.createdAt,
    )
    const rows = await db.db
      .selectFrom('cabildeo_delegation')
      .selectAll()
      .where('uri', '=', uri.toString())
      .execute()
    expect(rows).toHaveLength(0)
  })
})
