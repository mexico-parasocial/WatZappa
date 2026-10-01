// @ts-nocheck
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TID, cidForCbor } from '@atproto/common'
import { type SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// A `com.para.civic.vote` carrying `subjectType: 'policy'` publishes a -3..+3
// position under the identity that cast it, which is accepted (PARA
// revocable-mandates-spec §4.0) once m8 has authorized it with the signal
// bound. These pin that the AppView indexes only an authorized one, and keeps
// one row per person even when the person votes from a second identity.
maybeDescribe('policy votes', () => {
  let network: TestNetwork
  let sc: SeedClient
  let db: any

  const policyVote = (subject: string, signal = 2) => ({
    $type: 'com.para.civic.vote',
    subject,
    subjectType: 'policy',
    signal,
    isDirect: true,
    voteNullifier: 'e'.repeat(64),
    eligibilityProofRef: 'm8:policy:v1:' + 'f'.repeat(43),
    createdAt: new Date().toISOString(),
  })

  const withVerifier = async (status: number, run: () => Promise<void>) => {
    const previousUrl = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = 'https://issuer.test/verify'
    using _request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status }))
    try {
      await run()
    } finally {
      if (previousUrl === undefined)
        delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
      else process.env.PARA_CIVIC_VOTE_VERIFIER_URL = previousUrl
    }
  }

  const index = async (did: string, record: Record<string, unknown>) =>
    network.bsky.sub.indexingSvc.indexRecord(
      AtUri.make(did, 'com.para.civic.vote', TID.nextStr()),
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      new Date().toISOString(),
    )

  const rowsFor = (subject: string) =>
    db.db
      .selectFrom('para_policy_vote')
      .selectAll()
      .where('subject', '=', subject)
      .execute()

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

  it('the PDS refuses one without a valid authorization', async () => {
    const subject = `at://${sc.dids.alice}/app.bsky.feed.post/unauthorized`
    const attempt = sc.agent.com.atproto.repo.createRecord(
      {
        repo: sc.dids.alice,
        collection: 'com.para.civic.vote',
        record: { ...policyVote(subject), eligibilityProofRef: 'invented' },
      },
      { encoding: 'application/json', headers: sc.getHeaders(sc.dids.alice) },
    )
    await expect(attempt).rejects.toThrow(/civic vote/)
  })

  it('indexes an authorized one, one row per person across identities', async () => {
    const subject = `at://${sc.dids.alice}/app.bsky.feed.post/indexed`
    await withVerifier(204, async () => {
      await index(sc.dids.alice, policyVote(subject, 2))
      // Same person (same nullifier), voting again from another identity.
      await index(sc.dids.bob, policyVote(subject, -1))
    })
    const rows = await rowsFor(subject)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ creator: sc.dids.bob, signal: -1 })
  })

  it('refuses one m8 does not authorize', async () => {
    const subject = `at://${sc.dids.alice}/app.bsky.feed.post/rejected`
    await withVerifier(422, () => index(sc.dids.alice, policyVote(subject)))
    expect(await rowsFor(subject)).toHaveLength(0)
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

  // OD-7 §5h box 1: a -3..+3 RAQ answer and the dead civic-tree stance record
  // are frozen at both layers, so neither is aggregated here from a foreign PDS.
  it.each([
    [
      'com.para.raq.proposalAnswer',
      'raq_proposal_answer',
      (subject: string) => ({
        $type: 'com.para.raq.proposalAnswer',
        subject,
        value: -3,
        createdAt: new Date().toISOString(),
      }),
    ],
    [
      'com.para.community.civicTreeVote',
      'para_qvld_civicTree_vote',
      (subject: string) => ({
        $type: 'com.para.community.civicTreeVote',
        civicTree: subject,
        voter: sc.dids.alice,
        direction: 'agree',
        createdAt: new Date().toISOString(),
      }),
    ],
  ])('refuses to index a frozen %s', async (collection, table, build) => {
    const subject = `at://${sc.dids.alice}/com.para.raq.proposal/${TID.nextStr()}`
    const record = build(subject)
    const uri = AtUri.make(sc.dids.alice, collection, TID.nextStr())
    await network.bsky.sub.indexingSvc.indexRecord(
      uri,
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      record.createdAt,
    )
    const rows = await db.db
      .selectFrom(table)
      .selectAll()
      .where('uri', '=', uri.toString())
      .execute()
    expect(rows).toHaveLength(0)
  })
})
