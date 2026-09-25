// @ts-nocheck
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  TestNetwork,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  createParaStatus,
  usersSeed,
} from '@atproto/dev-env'
import { finalizeDueCabildeos } from '../src/data-plane/server/indexing/plugins/finalize-cabildeos.js'
import { resolveCabildeoDelegations } from '../src/data-plane/server/indexing/plugins/resolve-cabildeo-delegations.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

maybeDescribe('cabildeo direct vote from PDS to AppView', () => {
  let network: TestNetwork
  let verifier: Server
  let sc: ReturnType<TestNetwork['getSeedClient']>
  let cabildeo: string
  let community: string
  let boardUri: string
  let firstVoteCreatedAt: string
  let bob: string
  let alice: string
  let carol: string
  const previous = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
  const previousDelegation = process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL
  const previousResolver = process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET
  const previousTally = process.env.PARA_CABILDEO_DELEGATION_TALLY_ENABLED
  const voteNullifier = 'a'.repeat(64)
  const eligibilityProofRef = 'm8:cabildeo:v1:' + 'b'.repeat(43)
  const grantProof =
    'm8:delegation:v1:11111111-1111-4111-8111-111111111111:' + 'd'.repeat(43)

  beforeAll(async () => {
    verifier = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        const claim = JSON.parse(body)
        const valid =
          ((claim.actorDid === bob && claim.voteNullifier === voteNullifier) ||
            (claim.actorDid === alice &&
              claim.voteNullifier === 'c'.repeat(64))) &&
          claim.subjectUri === cabildeo &&
          [0, 1].includes(claim.selectedOption) &&
          claim.eligibilityProofRef === eligibilityProofRef
        const grantValid =
          (claim.actorDid === alice || claim.actorDid === carol) &&
          claim.delegateTo === bob &&
          claim.eligibilityProofRef === grantProof &&
          ((claim.mode === 'active' && claim.cabildeo === cabildeo) ||
            (claim.mode === 'passive' &&
              claim.party === 'Example' &&
              claim.community === community &&
              claim.scopeFlairs?.join(',') === 'education'))
        if (
          grantValid &&
          claim.subjectUri === cabildeo &&
          req.headers['x-m8-resolver-secret'] ===
            'test-resolver-secret-1234567890123456'
        ) {
          res.writeHead(200, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              voteNullifier:
                claim.actorDid === carol ? 'e'.repeat(64) : 'c'.repeat(64),
            }),
          )
        } else res.writeHead(valid || grantValid ? 204 : 422).end()
      })
    })
    await new Promise<void>((resolve) =>
      verifier.listen(0, '127.0.0.1', resolve),
    )
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = `http://127.0.0.1:${(verifier.address() as AddressInfo).port}/verify`
    process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL =
      process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET =
      'test-resolver-secret-1234567890123456'
    network = await TestNetwork.create({
      dbPostgresSchema: `cabildeo_direct_vote_${Array.from({ length: 8 }, () =>
        String.fromCharCode(97 + Math.floor(Math.random() * 26)),
      ).join('')}`,
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    bob = sc.dids.bob
    alice = sc.dids.alice
    carol = sc.dids.carol
    const board = await createCommunityBoardRecord(sc, alice, {
      name: 'Vote Journey',
      quadrant: 'civic',
    })
    boardUri = board.uri
    community = `vote-journey-${board.uri.split('/').pop()}`
    await createCommunityMembershipRecord(sc, bob, board.uri, 'active')
    await createCommunityMembershipRecord(sc, alice, board.uri, 'active')
    await createParaStatus(sc, bob, {
      status: 'Available',
      party: 'Example',
      community,
    })
    const record = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.civic.cabildeo',
        record: {
          $type: 'com.para.civic.cabildeo',
          title: 'Vote journey',
          description: 'One person, one direct ballot.',
          community,
          phase: 'voting',
          phaseDeadline: new Date(Date.now() + 3_600_000).toISOString(),
          flairs: ['education'],
          options: [{ label: 'Yes' }, { label: 'No' }],
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    cabildeo = record.data.uri
    await network.processAll()
  })

  afterAll(async () => {
    await network?.close()
    await new Promise<void>((resolve) => verifier?.close(() => resolve()))
    if (previous === undefined) delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    else process.env.PARA_CIVIC_VOTE_VERIFIER_URL = previous
    if (previousDelegation === undefined)
      delete process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL
    else process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL = previousDelegation
    if (previousResolver === undefined)
      delete process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET
    else process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET = previousResolver
    if (previousTally === undefined)
      delete process.env.PARA_CABILDEO_DELEGATION_TALLY_ENABLED
    else process.env.PARA_CABILDEO_DELEGATION_TALLY_ENABLED = previousTally
  })

  const cast = (selectedOption: number, proof = eligibilityProofRef) =>
    sc.agent.com.para.civic.castVote(
      {
        cabildeo,
        selectedOption,
        voteNullifier,
        eligibilityProofRef: proof,
      },
      { encoding: 'application/json', headers: sc.getHeaders(bob) },
    )

  it('writes a verified ballot and reflects it in AppView', async () => {
    const response = await cast(0)
    expect(response.data.uri).toContain('com.para.civic.vote')
    await network.processAll()
    const raw = await network.bsky.ctx.dataplane.getParaCabildeo({
      cabildeoUri: cabildeo,
    })
    const view = JSON.parse(raw.cabildeoJson)
    expect(view.voteTotals.total).toBe(1)
    expect(view.optionSummary[0].votes).toBe(1)
    firstVoteCreatedAt = (
      await network.bsky.db.db
        .selectFrom('cabildeo_vote')
        .where('cabildeo', '=', cabildeo)
        .select('createdAt')
        .executeTakeFirstOrThrow()
    ).createdAt
  })

  it('rejects an invalid proof and a verifier outage', async () => {
    await expect(cast(1, 'invented')).rejects.toThrow(
      /valid cabildeo vote proof/,
    )
    const configured = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = 'https://issuer.invalid/verify'
    try {
      await expect(cast(1)).rejects.toThrow(/verification is unavailable/)
    } finally {
      process.env.PARA_CIVIC_VOTE_VERIFIER_URL = configured
    }
  })

  it('replaces the ballot during the edit window without adding a participant', async () => {
    await cast(1)
    await network.processAll()
    const raw = await network.bsky.ctx.dataplane.getParaCabildeo({
      cabildeoUri: cabildeo,
    })
    const view = JSON.parse(raw.cabildeoJson)
    expect(view.voteTotals.total).toBe(1)
    expect(view.optionSummary.map((option) => option.votes)).toEqual([0, 1])
    const indexed = await network.bsky.db.db
      .selectFrom('cabildeo_vote')
      .where('cabildeo', '=', cabildeo)
      .select('createdAt')
      .executeTakeFirstOrThrow()
    expect(indexed.createdAt).toBe(firstVoteCreatedAt)
  })

  it('refuses edits after the original five-minute window', async () => {
    await network.bsky.db.db
      .updateTable('cabildeo_vote')
      .where('cabildeo', '=', cabildeo)
      .set({ createdAt: new Date(Date.now() - 10 * 60_000).toISOString() })
      .execute()
    try {
      await expect(cast(0)).rejects.toThrow(/Vote edit window has expired/)
    } finally {
      await network.bsky.db.db
        .updateTable('cabildeo_vote')
        .where('cabildeo', '=', cabildeo)
        .set({ createdAt: firstVoteCreatedAt })
        .execute()
    }
  })

  it('counts an active grant immediately, then removes its weight on revocation', async () => {
    process.env.PARA_CABILDEO_DELEGATION_TALLY_ENABLED = '1'
    const created = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        record: {
          $type: 'com.para.civic.delegation',
          mode: 'active',
          cabildeo,
          delegateTo: bob,
          eligibilityProofRef: grantProof,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const view = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(view.voteTotals.total).toBe(2)
    expect(view.voteTotals.delegated).toBe(1)
    expect(view.optionSummary[1].effectivePowerMicros).toBe(2_000_000)
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        rkey: created.data.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const revoked = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(revoked.voteTotals.total).toBe(1)
    expect(revoked.optionSummary[1].effectivePowerMicros).toBe(1_000_000)
  })

  it('does not count a verified grant from a nonmember', async () => {
    const created = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: carol,
        collection: 'com.para.civic.delegation',
        record: {
          $type: 'com.para.civic.delegation',
          mode: 'active',
          cabildeo,
          delegateTo: bob,
          eligibilityProofRef: grantProof,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(carol) },
    )
    await network.processAll()
    const view = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(view.voteTotals.total).toBe(1)
    expect(view.optionSummary[1].effectivePowerMicros).toBe(1_000_000)
    const membership = await createCommunityMembershipRecord(
      sc,
      carol,
      boardUri,
      'active',
    )
    await network.processAll()
    const joined = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(joined.voteTotals.total).toBe(2)
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: carol,
        collection: 'com.para.community.membership',
        rkey: membership.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(carol) },
    )
    await network.processAll()
    const left = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(left.voteTotals.total).toBe(1)
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: carol,
        collection: 'com.para.civic.delegation',
        rkey: created.data.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(carol) },
    )
    await network.processAll()
  })

  it('applies a passive grant only while its party and subject filters match', async () => {
    const created = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        record: {
          $type: 'com.para.civic.delegation',
          mode: 'passive',
          delegateTo: bob,
          party: 'Example',
          community,
          scopeFlairs: ['education'],
          eligibilityProofRef: grantProof,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const view = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(view.voteTotals.total).toBe(2)
    await createParaStatus(sc, bob, {
      status: 'Changed party',
      party: 'Other',
      community,
    })
    await network.processAll()
    const unmatched = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(unmatched.voteTotals.total).toBe(1)
    await createParaStatus(sc, bob, {
      status: 'Returned',
      party: 'Example',
      community,
    })
    await network.processAll()
    const matchedAgain = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(matchedAgain.voteTotals.total).toBe(2)
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        rkey: created.data.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(alice) },
    )
    await network.processAll()
  })

  it('lets the owner replace delegated weight with a direct ballot', async () => {
    const grant = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        record: {
          $type: 'com.para.civic.delegation',
          mode: 'active',
          cabildeo,
          delegateTo: bob,
          eligibilityProofRef: grantProof,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const direct = await sc.agent.com.para.civic.castVote(
      {
        cabildeo,
        selectedOption: 0,
        voteNullifier: 'c'.repeat(64),
        eligibilityProofRef,
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const view = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(view.voteTotals).toMatchObject({ total: 2, direct: 2, delegated: 0 })
    expect(view.optionSummary.map((option) => option.votes)).toEqual([1, 1])
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.vote',
        rkey: direct.data.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(alice) },
    )
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        rkey: grant.data.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(alice) },
    )
    await network.processAll()
  })

  it('recovers a due close and keeps its tally after a late revocation', async () => {
    const created = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        record: {
          $type: 'com.para.civic.delegation',
          mode: 'active',
          cabildeo,
          delegateTo: bob,
          eligibilityProofRef: grantProof,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const deadline = new Date(Date.now() + 600).toISOString()
    await network.bsky.db.db
      .updateTable('cabildeo_close_policy')
      .set({ deadline })
      .where('cabildeo', '=', cabildeo)
      .execute()
    await new Promise((resolve) => setTimeout(resolve, 700))
    await finalizeDueCabildeos(network.bsky.db.db)
    const first = await network.bsky.db.db
      .selectFrom('cabildeo_final_tally')
      .where('cabildeo', '=', cabildeo)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(first.summary.optionEffectivePowerMicros).toEqual([0, 2_000_000])
    const reproduced = resolveCabildeoDelegations(
      first.acceptedInputs.optionCount,
      first.acceptedInputs.ballots,
      first.acceptedInputs.delegations,
    )
    expect(reproduced.effectivePowerMicros).toEqual(
      first.summary.optionEffectivePowerMicros,
    )
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.delegation',
        rkey: created.data.uri.split('/').pop(),
      },
      { headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    await expect(cast(0)).rejects.toThrow(
      /Voting is not open|Voting phase|voting phase|InvalidPhase/,
    )
    const final = await network.bsky.db.db
      .selectFrom('cabildeo_final_tally')
      .where('cabildeo', '=', cabildeo)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(final.summary).toEqual(first.summary)
  })

  it('closes early when the author resolves a voting cabildeo', async () => {
    const record = {
      $type: 'com.para.civic.cabildeo',
      title: 'Early close',
      description: 'Resolution before the deadline.',
      community,
      phase: 'voting',
      phaseDeadline: new Date(Date.now() + 3_600_000).toISOString(),
      options: [{ label: 'Yes' }, { label: 'No' }],
      createdAt: new Date().toISOString(),
    }
    const created = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: record.$type,
        record,
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    cabildeo = created.data.uri
    await network.processAll()
    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: alice,
        collection: record.$type,
        rkey: cabildeo.split('/').pop(),
        record: {
          ...record,
          phaseDeadline: new Date(Date.now() + 7_200_000).toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const frozen = await network.bsky.db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', cabildeo)
      .select('phaseDeadline')
      .executeTakeFirstOrThrow()
    expect(frozen.phaseDeadline).toBe(record.phaseDeadline)
    await cast(0)
    await network.processAll()
    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: alice,
        collection: record.$type,
        rkey: cabildeo.split('/').pop(),
        record: { ...record, phase: 'resolved' },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    const final = await network.bsky.db.db
      .selectFrom('cabildeo_final_tally')
      .where('cabildeo', '=', cabildeo)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(final.summary.voteCount).toBe(1)
    const view = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: cabildeo,
        })
      ).cabildeoJson,
    )
    expect(view.phase).toBe('resolved')
    await expect(cast(1)).rejects.toThrow(
      /Voting is not open|Voting phase|voting phase|InvalidPhase/,
    )
  })
})
