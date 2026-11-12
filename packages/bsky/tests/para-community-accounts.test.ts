import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TID, cidForCbor } from '@atproto/common'
import { type SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'
import { parseCid } from '@atproto/lex-data'
import { lexParse } from '@atproto/lex-json'
import { WriteOpAction } from '@atproto/repo'
import { AtUri, type DidString } from '@atproto/syntax'
import {
  communityHostCheck,
  refoldCommunityChain,
  signingKeyResolver,
} from '../src/data-plane/server/community-chain.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

const ACT = 'com.para.community.act'
const EVENT = 'com.para.community.event'
const REQUEST = 'com.para.community.request'

// OD-9 phase 2: a community is an account whose chain only its host's
// `act` writes, and the AppView folds that chain to the same state whatever
// order its events arrive in, and again on a rebuild.
maybeDescribe('community accounts (OD-9)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // founder
  let bob: DidString // moderator
  let carol: DidString // member
  let dan: DidString // member through service auth
  let community: DidString
  let handle: string

  const pds = async (
    nsid: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) => {
    const res = await fetch(new URL(`/xrpc/${nsid}`, network.pds.url), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return {
      status: res.status,
      body: (text ? JSON.parse(text) : {}) as {
        error?: string
        seq?: number
        uri?: string
        did?: DidString
        handle?: string
      },
    }
  }

  const act = (
    by: DidString,
    input: Record<string, unknown>,
    target: DidString = community,
  ) => pds(ACT, { community: target, ...input }, sc.getHeaders(by))

  const create = (by: DidString, slug: string) =>
    pds(
      'com.para.community.create',
      { name: slug, slug, quadrant: 'centro' },
      sc.getHeaders(by),
    )

  const db = () => network.bsky.db.db

  const members = async (target = community) =>
    (
      await db()
        .selectFrom('para_community_member_state')
        .select(['did', 'status', 'offices', 'suspendedUntil'])
        .where('community', '=', target)
        .orderBy('did')
        .execute()
    ).map((row) => ({ ...row, offices: [...row.offices].sort() }))

  const account = (target = community) =>
    db()
      .selectFrom('para_community_account')
      .selectAll()
      .where('did', '=', target)
      .executeTakeFirstOrThrow()

  const chain = (target = community) =>
    db()
      .selectFrom('para_community_chain_event')
      .select(['uri', 'seq', 'action', 'status', 'reason'])
      .where('community', '=', target)
      .orderBy('seq')
      .execute()

  // Everything the fold produces, for comparing two runs.
  const snapshot = async (target = community) => {
    const { lastSeq, lastCid, governanceMode, admissionMode, broken } =
      await account(target)
    return {
      account: { lastSeq, lastCid, governanceMode, admissionMode, broken },
      members: await members(target),
      offers: await db()
        .selectFrom('para_community_open_offer')
        .select(['seq', 'office', 'subject', 'issuer', 'expiresAt'])
        .where('community', '=', target)
        .orderBy('seq')
        .execute(),
      events: (await chain(target)).map(({ seq, status, reason }) => ({
        seq,
        status,
        reason,
      })),
    }
  }

  const chainDeps = () => ({
    signingKey: signingKeyResolver(network.bsky.dataplane.idResolver),
    isCommunityHost: communityHostCheck(network.bsky.dataplane.idResolver),
  })

  const refold = (target = community) =>
    network.bsky.db.transaction((txn) =>
      refoldCommunityChain(txn, chainDeps(), target, new Date().toISOString()),
    )

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_community_accounts_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)
    const created = await create(alice, 'barrio-norte')
    expect(created.status).toBe(200)
    community = created.body.did as DidString
    handle = created.body.handle as string
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('creates a community account its founder owns and nobody can sign in as', async () => {
    expect(handle).toBe('barrio-norte.community.test')
    expect(await account()).toMatchObject({
      lastSeq: 1,
      governanceMode: 'hierarchical',
      admissionMode: 'open',
      broken: null,
      name: 'barrio-norte',
    })
    expect(await members()).toEqual([
      {
        did: alice,
        status: 'active',
        offices: ['owner'],
        suspendedUntil: null,
      },
    ])
    const session = await fetch(
      new URL('/xrpc/com.atproto.server.createSession', network.pds.url),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: handle, password: 'anything' }),
      },
    )
    expect(session.status).toBe(401)
    expect((await create(bob, 'barrio-norte')).body.error).toBe(
      'HandleNotAvailable',
    )
  })

  it('takes each phase-2 action, and refuses what the policy forbids', async () => {
    for (const did of [bob, carol]) {
      expect((await act(did, { action: 'member.join' })).status).toBe(200)
    }
    const offer = await act(alice, { action: 'moderator.offer', subject: bob })
    expect(offer.status).toBe(200)

    // Refused: wrong actor, nothing appended.
    const before = await act(carol, {
      action: 'moderator.offer',
      subject: carol,
    })
    expect(before).toMatchObject({
      status: 400,
      body: { error: 'NotPermitted' },
    })
    expect(
      await act(carol, {
        action: 'moderator.accept',
        subject: bob,
        offer: offer.body.seq,
      }),
    ).toMatchObject({ status: 400, body: { error: 'NotPermitted' } })

    expect(
      (await act(bob, { action: 'moderator.accept', offer: offer.body.seq }))
        .status,
    ).toBe(200)
    expect(
      (
        await act(bob, {
          action: 'member.suspend',
          subject: carol,
          suspensionDays: 2,
        })
      ).status,
    ).toBe(200)
    expect(await act(carol, { action: 'member.leave' })).toMatchObject({
      status: 400,
      body: { error: 'InvalidSubject' },
    })
    expect(
      (await act(bob, { action: 'member.reinstate', subject: carol })).status,
    ).toBe(200)
    expect(await act(alice, { action: 'member.leave' })).toMatchObject({
      status: 400,
      body: { error: 'LastOwner' },
    })
    await network.processAll()

    expect(await members()).toEqual(
      [
        {
          did: alice,
          status: 'active',
          offices: ['owner'],
          suspendedUntil: null,
        },
        {
          did: bob,
          status: 'active',
          offices: ['moderator'],
          suspendedUntil: null,
        },
        { did: carol, status: 'active', offices: [], suspendedUntil: null },
      ].sort((a, b) => a.did.localeCompare(b.did)),
    )
    const events = await chain()
    expect(events.map((event) => event.action)).toEqual([
      'community.found',
      'member.join',
      'member.join',
      'moderator.offer',
      'moderator.accept',
      'member.suspend',
      'member.reinstate',
    ])
    expect(events.every((event) => event.status === 'applied')).toBe(true)
  })

  it('accepts a member elsewhere through a service JWT and their own request', async () => {
    const now = Date.now()
    const request = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: dan,
        collection: REQUEST,
        record: {
          $type: REQUEST,
          community,
          action: 'member.join',
          subject: dan,
          createdAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(dan) },
    )
    const ref = { uri: request.data.uri, cid: request.data.cid }
    const bearer = async (aud: string) => ({
      authorization: `Bearer ${await network.pds.ctx.serviceAuthJwt(dan, aud, ACT)}`,
    })

    const other = await create(carol, 'otra-colonia')
    expect(
      await pds(
        ACT,
        { community, action: 'member.join', request: ref },
        await bearer(other.body.did as string),
      ),
    ).toMatchObject({ status: 401, body: { error: 'BadJwtAudience' } })
    expect(
      await pds(
        ACT,
        { community, action: 'member.join' },
        await bearer(community),
      ),
    ).toMatchObject({ status: 400, body: { error: 'InvalidRequest' } })

    const joined = await pds(
      ACT,
      { community, action: 'member.join', request: ref },
      await bearer(community),
    )
    expect(joined.status).toBe(200)
    // A request backs one event.
    expect(
      await pds(
        ACT,
        { community, action: 'member.leave', request: ref },
        await bearer(community),
      ),
    ).toMatchObject({ status: 400, body: { error: 'InvalidRequest' } })
    await network.processAll()
    expect((await members()).find((m) => m.did === dan)).toMatchObject({
      status: 'active',
    })
  })

  it('serializes concurrent actions into one contiguous chain', async () => {
    const joiners: DidString[] = []
    for (let i = 0; i < 6; i++) {
      const name = `joiner${i}`
      await sc.createAccount(name, {
        handle: `${name}.test`,
        email: `${name}@test.com`,
        password: `${name}-pass`,
      })
      joiners.push(sc.dids[name])
    }
    const head = (await account()).lastSeq
    const results = await Promise.all(
      joiners.map((did) => act(did, { action: 'member.join' })),
    )
    expect(results.map((r) => r.status)).toEqual(joiners.map(() => 200))
    expect(results.map((r) => r.body.seq).sort((a, b) => a! - b!)).toEqual(
      joiners.map((_, i) => head + 1 + i),
    )
    await network.processAll()
    const state = await snapshot()
    expect(state.account.lastSeq).toBe(head + joiners.length)
    expect(state.events.every((event) => event.status === 'applied')).toBe(true)
  })

  it('folds the same state from events delivered in any order', async () => {
    const expected = await snapshot()
    const records = await db()
      .selectFrom('record')
      .select(['uri', 'cid', 'json'])
      .where('did', '=', community)
      .where('uri', 'like', `%/${EVENT}/%`)
      .execute()
    const bySeq = records
      .map((row) => ({ ...row, record: lexParse(row.json) as { seq: number } }))
      .sort((a, b) => b.record.seq - a.record.seq)

    // Forget the community entirely, as a fresh AppView would.
    await db()
      .deleteFrom('record')
      .where(
        'uri',
        'in',
        records.map((r) => r.uri),
      )
      .execute()
    for (const table of [
      'para_community_member_state',
      'para_community_open_offer',
      'para_community_used_request',
    ] as const) {
      await db().deleteFrom(table).where('community', '=', community).execute()
    }
    await db()
      .deleteFrom('para_community_chain_event')
      .where('community', '=', community)
      .execute()
    await db()
      .updateTable('para_community_account')
      .set({
        lastSeq: 0,
        lastCid: null,
        governanceMode: null,
        admissionMode: null,
      })
      .where('did', '=', community)
      .execute()

    // Newest first: nothing can apply until seq 1 arrives last.
    for (const [i, row] of bySeq.entries()) {
      await network.bsky.sub.indexingSvc.indexRecord(
        new AtUri(row.uri),
        parseCid(row.cid),
        row.record,
        WriteOpAction.Create,
        new Date().toISOString(),
      )
      if (i < bySeq.length - 1) expect((await account()).lastSeq).toBe(0)
    }
    expect(await snapshot()).toEqual(expected)
  })

  it('rebuilds the same state from its stored events', async () => {
    const expected = await snapshot()
    await refold()
    expect(await snapshot()).toEqual(expected)
  })

  it('does not count a chain written outside a community host', async () => {
    // carol writes a founding event into her own repo, with a genuine
    // request and proof, but her DID document names no community host.
    const now = Date.now()
    const request = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: carol,
        collection: REQUEST,
        record: {
          $type: REQUEST,
          community: carol,
          action: 'community.found',
          subject: carol,
          createdAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 60_000).toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(carol) },
    )
    const proof = await fetch(
      new URL(
        `/xrpc/com.atproto.sync.getRecord?did=${carol}&collection=${REQUEST}&rkey=${new AtUri(request.data.uri).rkey}`,
        network.pds.url,
      ),
    ).then((res) => res.arrayBuffer())
    const created = await fetch(
      new URL('/xrpc/com.atproto.repo.createRecord', network.pds.url),
      {
        method: 'POST',
        headers: {
          ...sc.getHeaders(carol),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          repo: carol,
          collection: EVENT,
          record: {
            $type: EVENT,
            seq: 1,
            action: 'community.found',
            actor: carol,
            subject: carol,
            request: { uri: request.data.uri, cid: request.data.cid },
            requestProof: {
              $bytes: Buffer.from(proof).toString('base64').replace(/=+$/, ''),
            },
            governanceMode: 'hierarchical',
            admissionMode: 'open',
            createdAt: new Date(now).toISOString(),
          },
        }),
      },
    )
    expect(created.status).toBe(200)
    await network.processAll()
    expect(await chain(carol)).toMatchObject([
      {
        seq: 1,
        status: 'invalid',
        reason: 'The DID document names no community host.',
      },
    ])
    expect(await account(carol)).toMatchObject({ governanceMode: null })
    expect(await members(carol)).toEqual([])
  })

  it('ignores an event whose request proof does not verify', async () => {
    // A host acting for bob without his request: it reuses a proof of
    // someone else's record. Injected as if it came from the host's repo.
    const third = (await create(dan, 'tercera')).body.did as DidString
    await network.processAll()
    const head = await account(third)
    const founding = await db()
      .selectFrom('para_community_chain_event')
      .select(['requestUri', 'requestProof'])
      .where('community', '=', third)
      .where('seq', '=', 1)
      .executeTakeFirstOrThrow()
    const record = {
      $type: EVENT,
      seq: 2,
      prev: head.lastCid!,
      action: 'member.join',
      actor: bob,
      subject: bob,
      request: {
        uri: `at://${bob}/${REQUEST}/${TID.nextStr()}`,
        cid: (await cidForCbor({ forged: true })).toString(),
      },
      requestProof: new Uint8Array(founding.requestProof),
      createdAt: new Date().toISOString(),
    }
    await network.bsky.sub.indexingSvc.indexRecord(
      AtUri.make(third, EVENT, TID.nextStr()),
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      record.createdAt,
    )
    expect((await chain(third)).find((event) => event.seq === 2)).toMatchObject(
      {
        status: 'invalid',
        reason: 'The request proof is invalid.',
      },
    )
    expect((await members(third)).map((m) => m.did)).toEqual([dan])
  })

  it('freezes a community on a forked or unlinked event', async () => {
    const inject = async (
      target: DidString,
      fields: Record<string, unknown>,
    ) => {
      const record = {
        $type: EVENT,
        action: 'member.leave',
        actor: dan,
        subject: dan,
        request: {
          uri: `at://${dan}/${REQUEST}/${TID.nextStr()}`,
          cid: (await cidForCbor({ any: true })).toString(),
        },
        requestProof: new Uint8Array([0]),
        createdAt: new Date().toISOString(),
        ...fields,
      }
      await network.bsky.sub.indexingSvc.indexRecord(
        AtUri.make(target, EVENT, TID.nextStr()),
        await cidForCbor(record),
        record,
        WriteOpAction.Create,
        record.createdAt,
      )
    }
    // Two events claiming the next seq.
    const forked = (await create(dan, 'bifurcada')).body.did as DidString
    await network.processAll()
    const { lastCid } = await account(forked)
    await inject(forked, { seq: 2, prev: lastCid })
    await inject(forked, { seq: 2, prev: lastCid })
    expect(await account(forked)).toMatchObject({
      broken: 'Two events claim seq 2.',
      lastSeq: 1,
    })

    // An event whose prev is not the event before it.
    const unlinked = (await create(dan, 'desligada')).body.did as DidString
    await network.processAll()
    await inject(unlinked, { seq: 2, prev: lastCid })
    expect((await account(unlinked)).broken).toBe('Event 2 does not follow 1.')
  })

  it('freezes a community whose event is deleted, before that event', async () => {
    const other = (
      await db()
        .selectFrom('para_community_account')
        .select('did')
        .where('name', '=', 'otra-colonia')
        .executeTakeFirstOrThrow()
    ).did as DidString
    for (const did of [alice, bob]) {
      expect((await act(did, { action: 'member.join' }, other)).status).toBe(
        200,
      )
    }
    await network.processAll()
    const second = (await chain(other)).find((event) => event.seq === 2)!
    await network.bsky.sub.indexingSvc.deleteRecord(new AtUri(second.uri))

    const frozen = await snapshot(other)
    expect(frozen.account.broken).toBe('Event 2 was deleted.')
    expect(frozen.account.lastSeq).toBe(1)
    expect(frozen.members.map((m) => m.did)).toEqual([carol])
    await refold(other)
    expect(await snapshot(other)).toEqual(frozen)
  })
})
