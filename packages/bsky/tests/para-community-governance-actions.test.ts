import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COMMUNITY_ACTIONS, describeCommunityActions } from '@atproto/common'
import {
  type SeedClient,
  TestNetwork,
  TestPds,
  usersSeed,
} from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import {
  communityHostCheck,
  refoldCommunityChain,
  signingKeyResolver,
} from '../src/data-plane/server/community-chain.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

const ACT = 'com.para.community.act'
const REQUEST = 'com.para.community.request'
const SHARE = 'com.para.community.sharedContent'
const PACK = 'com.para.community.briefingPack'

type Item = {
  uri: string
  removed: boolean
  removedBy: string
  pinned: boolean
}

// OD-9 phase 4: every action the policy describes is taken through `act`,
// folded by the AppView, and served from the chain.
maybeDescribe('community governance actions (OD-9)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // owner of north, then of nothing, then of north again
  let bob: DidString // moderator of north
  let carol: DidString // member
  let dan: DidString // owner of south; also a member of north
  let eve: DidString
  let frank: DidString
  let gina: DidString // never joins
  let north: DidString
  let south: DidString
  let elsewhere: TestPds // a second PDS, hosting no community
  let east: DidString // owned by eve; created by the cycle test
  let northUri: string
  let southUri: string

  const uriOf = (did: string) => `at://${did}/com.para.community.profile/self`

  const pds = async (
    by: DidString,
    nsid: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => {
    const res = await fetch(new URL(`/xrpc/${nsid}`, network.pds.url), {
      method: 'POST',
      headers: {
        ...(headers ?? sc.getHeaders(by)),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return {
      status: res.status,
      body: (await res.json()) as {
        error?: string
        seq?: number
        did?: string
      },
    }
  }

  const act = (
    by: DidString,
    input: Record<string, unknown>,
    community: DidString = north,
  ) => pds(by, ACT, { community, ...input })

  /** Takes the action and expects it to be appended. */
  const take = async (
    by: DidString,
    input: Record<string, unknown>,
    community: DidString = north,
  ) => {
    const res = await act(by, input, community)
    expect({ input, res: res.body }).toMatchObject({
      res: { seq: expect.any(Number) },
    })
    await network.processAll()
    return res.body.seq as number
  }

  const refuses = async (
    by: DidString,
    input: Record<string, unknown>,
    error: string,
    community: DidString = north,
  ) =>
    expect(await act(by, input, community)).toMatchObject({
      status: 400,
      body: { error },
    })

  const view = async <T>(
    nsid: string,
    params: Record<string, string>,
    viewer?: DidString,
  ) => {
    const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    const res = await fetch(url, {
      headers: viewer ? await network.serviceHeaders(viewer, nsid) : {},
    })
    return { status: res.status, body: (await res.json()) as T }
  }

  const db = () => network.bsky.db.db

  const member = async (did: DidString, community: DidString = north) =>
    db()
      .selectFrom('para_community_member_state')
      .select(['status', 'offices'])
      .where('community', '=', community)
      .where('did', '=', did)
      .executeTakeFirst()

  const openOffers = async (community: DidString = north) =>
    (
      await db()
        .selectFrom('para_community_open_offer')
        .select(['seq', 'office', 'subject'])
        .where('community', '=', community)
        .execute()
    ).map((offer) => offer.seq)

  const write = async (
    by: DidString,
    collection: string,
    record: Record<string, unknown>,
    rkey?: string,
  ) => {
    const input = {
      repo: by,
      collection,
      record: { $type: collection, ...record },
    }
    const opts = {
      encoding: 'application/json' as const,
      headers: sc.getHeaders(by),
    }
    const { data } = rkey
      ? await sc.agent.com.atproto.repo.putRecord({ ...input, rkey }, opts)
      : await sc.agent.com.atproto.repo.createRecord(input, opts)
    await network.processAll()
    return { uri: data.uri, cid: data.cid }
  }

  const shareBy = async (by: DidString, communityUri = northUri) => {
    const post = await sc.post(by, `shared ${randomUUID()}`)
    return write(by, SHARE, {
      subject: { uri: post.ref.uriStr, cid: post.ref.cidStr },
      communityUri,
      contentType: 'post',
      sharedBy: by,
      createdAt: new Date().toISOString(),
    })
  }

  const items = async (includeRemoved = false) =>
    (
      await view<{ items: Item[] }>(
        'com.para.community.listSharedContent',
        {
          communityUri: northUri,
          ...(includeRemoved ? { includeRemoved: 'true' } : {}),
        },
        includeRemoved ? alice : undefined,
      )
    ).body.items

  const draft = (
    by: DidString,
    title: string,
    rkey?: string,
    communityUri = northUri,
  ) =>
    write(
      by,
      PACK,
      {
        packType: 'party_lobbying',
        communityUri,
        party: 'Independent',
        title,
        summary: 'summary',
        cabildeoUris: [],
        civicTreeCardIds: [],
        evidenceUris: [],
        status: 'draft',
        createdBy: by,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      rkey,
    )

  const packs = async (status?: string) =>
    (
      await view<{ packs: Array<{ title: string; status: string }> }>(
        'com.para.community.listBriefingPacks',
        { community: northUri, ...(status ? { status } : {}) },
      )
    ).body.packs.map((pack) => `${pack.title}:${pack.status}`)

  const children = async (community: string) =>
    (
      await view<{ relations: Array<{ childCommunityUri: string }> }>(
        'com.para.community.listChildCommunities',
        { communityUri: community },
      )
    ).body.relations.map((relation) => relation.childCommunityUri)

  const chainDeps = () => ({
    signingKey: signingKeyResolver(network.bsky.dataplane.idResolver),
    isCommunityHost: communityHostCheck(network.bsky.dataplane.idResolver),
  })

  // Everything the fold produces for a community, for comparing two runs.
  const snapshot = async (community: DidString) => {
    const table = (name: string) =>
      (db() as any)
        .selectFrom(name)
        .selectAll()
        .where('community', '=', community)
        .execute() as Promise<unknown[]>
    const sorted = (rows: unknown[]) =>
      rows
        .map((row) => JSON.stringify(row))
        .sort()
        .map((row) => JSON.parse(row))
    const account = await db()
      .selectFrom('para_community_account')
      .select(['lastSeq', 'lastCid', 'broken'])
      .where('did', '=', community)
      .executeTakeFirstOrThrow()
    return {
      account,
      members: sorted(await table('para_community_member_state')),
      offers: sorted(await table('para_community_open_offer')),
      content: sorted(await table('para_community_content_state')),
      briefings: sorted(await table('para_community_briefing_state')),
      halves: sorted(await table('para_community_relation_half')),
    }
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_community_governance_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    for (const name of ['eve', 'frank', 'gina']) {
      await sc.createAccount(name, {
        handle: `${name}.test`,
        email: `${name}@test.com`,
        password: `${name}-pass`,
      })
    }
    ;({ alice, bob, carol, dan, eve, frank, gina } = sc.dids)
    const create = async (by: DidString, slug: string) =>
      (
        await pds(by, 'com.para.community.create', {
          name: slug,
          slug,
          quadrant: 'centro',
        })
      ).body.did as DidString
    north = await create(alice, 'norte')
    south = await create(dan, 'sur')
    northUri = uriOf(north)
    southUri = uriOf(south)
    await network.processAll()
    for (const did of [bob, carol, dan, eve, frank]) {
      await take(did, { action: 'member.join' })
    }
    const offer = await take(alice, { action: 'moderator.offer', subject: bob })
    await take(bob, { action: 'moderator.accept', offer })
  })

  afterAll(async () => {
    await elsewhere?.close()
    await network.close()
  })

  it('removes without blocking, and a removed member can join again', async () => {
    await refuses(
      bob,
      { action: 'member.remove', subject: carol },
      'NotPermitted',
    )
    await refuses(
      alice,
      { action: 'member.remove', subject: alice },
      'InvalidSubject',
    )
    await take(alice, { action: 'member.remove', subject: carol })
    expect(await member(carol)).toMatchObject({
      status: 'removed',
      offices: [],
    })
    await take(carol, { action: 'member.join' })
    expect(await member(carol)).toMatchObject({ status: 'active', offices: [] })
  })

  it('blocks on a moderator’s proposal, and unblocking restores only the right to join', async () => {
    const proposal = await take(bob, {
      action: 'sanction.propose',
      subject: eve,
      sanction: 'block',
    })
    expect(await openOffers()).toContain(proposal)
    await refuses(
      alice,
      { action: 'sanction.propose', subject: eve, sanction: 'block' },
      'NotPermitted',
    )
    // A proposal to block cannot back a removal.
    await refuses(
      alice,
      { action: 'member.remove', subject: eve, offer: proposal },
      'InvalidOffer',
    )
    await take(alice, { action: 'member.block', subject: eve, offer: proposal })
    expect(await member(eve)).toMatchObject({ status: 'blocked', offices: [] })
    expect(await openOffers()).not.toContain(proposal)
    await refuses(eve, { action: 'member.join' }, 'NotPermitted')

    const members = await view<{ members: Array<{ did: string }> }>(
      'com.para.community.listMembers',
      { communityId: 'norte.community.test', membershipState: 'blocked' },
      alice,
    )
    expect(members.body.members.map((m) => m.did)).toEqual([eve])

    await refuses(
      bob,
      { action: 'member.unblock', subject: eve },
      'NotPermitted',
    )
    await take(alice, { action: 'member.unblock', subject: eve })
    expect(await member(eve)).toMatchObject({ status: 'left' })
    await take(eve, { action: 'member.join' })
    expect(await member(eve)).toMatchObject({ status: 'active' })
    // An owner can also block someone who never joined.
    await take(alice, { action: 'member.block', subject: frank })
    await take(alice, { action: 'member.unblock', subject: frank })
    await take(frank, { action: 'member.join' })
  })

  it('transfers ownership by offer, acceptance and resignation', async () => {
    await refuses(alice, { action: 'owner.resign' }, 'LastOwner')
    const offer = await take(alice, { action: 'owner.offer', subject: bob })
    // An ownership offer cannot be taken as a moderator office.
    await refuses(bob, { action: 'moderator.accept', offer }, 'InvalidOffer')
    await refuses(
      carol,
      { action: 'owner.accept', subject: bob, offer },
      'NotPermitted',
    )
    await take(bob, { action: 'owner.accept', offer })
    // Ownership replaces the moderator office.
    expect(await member(bob)).toMatchObject({ offices: ['owner'] })
    await take(alice, { action: 'owner.resign' })
    expect(await member(alice)).toMatchObject({ status: 'active', offices: [] })
    await refuses(bob, { action: 'owner.resign' }, 'LastOwner')
    await refuses(
      alice,
      { action: 'member.remove', subject: bob },
      'NotPermitted',
    )

    const roles = await view<{ roles: string[] }>(
      'com.para.community.getAuthorization',
      { community: northUri, action: 'content.moderate' },
      bob,
    )
    expect(roles.body.roles).toContain('owner')

    // Hand it back, and give bob his moderator office again.
    const back = await take(bob, { action: 'owner.offer', subject: alice })
    await take(alice, { action: 'owner.accept', offer: back })
    await take(bob, { action: 'owner.resign' })
    const again = await take(alice, { action: 'moderator.offer', subject: bob })
    await take(bob, { action: 'moderator.accept', offer: again })
    expect(await member(bob)).toMatchObject({ offices: ['moderator'] })
    expect(await member(alice)).toMatchObject({ offices: ['owner'] })
  })

  it('hides, pins and restores shares by event, and a share counts only while its author is a member', async () => {
    const hidden = await shareBy(carol)
    const pinned = await shareBy(dan)
    const stranger = await shareBy(frank)
    const target = (ref: { uri: string }) => ref.uri
    expect((await items()).map((item) => item.uri).sort()).toEqual(
      [hidden.uri, pinned.uri, stranger.uri].sort(),
    )

    await refuses(
      carol,
      { action: 'content.hide', subject: carol, target: target(hidden) },
      'NotPermitted',
    )
    // The subject must be the repo that holds the share.
    await refuses(
      bob,
      { action: 'content.hide', subject: dan, target: target(hidden) },
      'InvalidTarget',
    )

    await take(bob, {
      action: 'content.hide',
      subject: carol,
      target: target(hidden),
    })
    await take(bob, {
      action: 'content.pin',
      subject: dan,
      target: target(pinned),
    })
    expect((await items()).map((item) => item.uri).sort()).toEqual(
      [pinned.uri, stranger.uri].sort(),
    )
    const all = await items(true)
    expect(all.find((item) => item.uri === hidden.uri)).toMatchObject({
      removed: true,
      removedBy: bob,
    })
    expect(all.find((item) => item.uri === pinned.uri)).toMatchObject({
      pinned: true,
    })

    await take(alice, {
      action: 'content.restore',
      subject: carol,
      target: target(hidden),
    })
    await take(alice, {
      action: 'content.unpin',
      subject: dan,
      target: target(pinned),
    })
    const restored = await items(true)
    expect(restored.every((item) => !item.removed && !item.pinned)).toBe(true)

    // Leaving takes a member's shares out of the community.
    await take(carol, { action: 'member.leave' })
    expect((await items()).map((item) => item.uri)).not.toContain(hidden.uri)
    await take(carol, { action: 'member.join' })
    expect((await items()).map((item) => item.uri)).toContain(hidden.uri)
  })

  it('counts a relation only when both communities hold their half, in either order', async () => {
    const southOwner = dan
    expect(await children(northUri)).toEqual([])
    await refuses(
      bob,
      { action: 'relation.link', subject: south },
      'NotPermitted',
    )
    await refuses(
      alice,
      { action: 'relation.link', subject: north },
      'InvalidSubject',
    )

    await take(alice, { action: 'relation.link', subject: south })
    expect(await children(northUri)).toEqual([])
    await take(southOwner, { action: 'relation.accept', subject: north }, south)
    expect(await children(northUri)).toEqual([southUri])

    await take(southOwner, { action: 'relation.unlink', subject: north }, south)
    expect(await children(northUri)).toEqual([])
    // The accept can come before the link.
    await take(southOwner, { action: 'relation.accept', subject: north }, south)
    expect(await children(northUri)).toEqual([southUri])
    await take(alice, { action: 'relation.unlink', subject: south })
    expect(await children(northUri)).toEqual([])
    await take(alice, { action: 'relation.link', subject: south })
    expect(await children(northUri)).toEqual([southUri])
  })

  it('sets aside every relation on a cycle, however long, until one is withdrawn', async () => {
    east = (
      await pds(eve, 'com.para.community.create', {
        name: 'este',
        slug: 'este',
        quadrant: 'centro',
      })
    ).body.did as DidString
    await network.processAll()
    const eastUri = uriOf(east)
    // north -> south already stands from the previous test.
    expect(await children(northUri)).toEqual([southUri])
    await take(dan, { action: 'relation.link', subject: east }, south)
    await take(eve, { action: 'relation.accept', subject: south }, east)
    expect(await children(southUri)).toEqual([eastUri])

    // east -> north closes a cycle of three: no chain holds both ends of it.
    await take(eve, { action: 'relation.link', subject: north }, east)
    await take(alice, { action: 'relation.accept', subject: east })
    expect(await children(northUri)).toEqual([])
    expect(await children(southUri)).toEqual([])
    expect(await children(eastUri)).toEqual([])

    // Withdrawing any one relation restores the other two.
    await take(dan, { action: 'relation.unlink', subject: east }, south)
    expect(await children(northUri)).toEqual([southUri])
    expect(await children(eastUri)).toEqual([northUri])
    expect(await children(southUri)).toEqual([])

    await take(alice, { action: 'relation.unlink', subject: east })
    await take(alice, { action: 'relation.unlink', subject: south })
    await take(alice, { action: 'relation.link', subject: south })
    expect(await children(northUri)).toEqual([southUri])
  })

  it('publishes the exact version of a member’s draft, and editing withdraws it', async () => {
    const first = await draft(carol, 'first')
    const rkey = first.uri.split('/').pop()!
    expect(await packs()).toEqual([])
    const publish = (version: { uri: string; cid: string }, by = bob) => ({
      by,
      input: {
        action: 'briefing.publish',
        subject: carol,
        target: version.uri,
        targetCid: version.cid,
      },
    })

    await refuses(carol, publish(first).input, 'NotPermitted')
    await refuses(
      bob,
      { ...publish(first).input, targetCid: undefined },
      'InvalidTarget',
    )
    await take(bob, publish(first).input)
    expect(await packs()).toEqual(['first:published'])

    const edited = await draft(carol, 'first, edited', rkey)
    expect(edited.cid).not.toBe(first.cid)
    expect(await packs()).toEqual([])
    await take(alice, publish(edited).input)
    expect(await packs()).toEqual(['first, edited:published'])

    await take(bob, { ...publish(edited).input, action: 'briefing.archive' })
    expect(await packs()).toEqual(['first, edited:archived'])
    expect(await packs('published')).toEqual([])
    expect(await packs('archived')).toEqual(['first, edited:archived'])

    // Only a member’s draft can be published.
    const outsider = await draft(gina, 'outsider')
    await refuses(
      bob,
      {
        action: 'briefing.publish',
        subject: gina,
        target: outsider.uri,
        targetCid: outsider.cid,
      },
      'InvalidSubject',
    )
  })

  it('binds a member’s own request to every parameter of the action', async () => {
    const now = Date.now()
    const request = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: bob,
        collection: REQUEST,
        record: {
          $type: REQUEST,
          community: north,
          action: 'content.hide',
          subject: carol,
          target: `at://${carol}/${SHARE}/aaa`,
          createdAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(bob) },
    )
    const jwt = await network.pds.ctx.serviceAuthJwt(bob, north, ACT)
    const asService = { authorization: `Bearer ${jwt}` }
    const ref = { uri: request.data.uri, cid: request.data.cid }
    // The request names one share; the act names another.
    expect(
      await pds(
        bob,
        ACT,
        {
          community: north,
          action: 'content.hide',
          subject: carol,
          target: `at://${carol}/${SHARE}/bbb`,
          request: ref,
        },
        asService,
      ),
    ).toMatchObject({ status: 400, body: { error: 'InvalidRequest' } })
    expect(
      (
        await pds(
          bob,
          ACT,
          {
            community: north,
            action: 'content.hide',
            subject: carol,
            target: `at://${carol}/${SHARE}/aaa`,
            request: ref,
          },
          asService,
        )
      ).status,
    ).toBe(200)
    await network.processAll()
  })

  it('suspends, reinstates, revokes and resigns', async () => {
    await take(bob, {
      action: 'member.suspend',
      subject: carol,
      suspensionDays: 2,
    })
    expect(await member(carol)).toMatchObject({ status: 'suspended' })
    await take(bob, { action: 'member.reinstate', subject: carol })
    expect(await member(carol)).toMatchObject({ status: 'active' })

    await take(alice, { action: 'moderator.revoke', subject: bob })
    expect(await member(bob)).toMatchObject({ status: 'active', offices: [] })
    const offer = await take(alice, { action: 'moderator.offer', subject: bob })
    await take(bob, { action: 'moderator.accept', offer })
    await take(bob, { action: 'moderator.resign' })
    expect(await member(bob)).toMatchObject({ status: 'active', offices: [] })
  })

  it('lists community accounts among boards, under every filter and sort', async () => {
    type Listed = {
      uri: string
      name: string
      memberCount: number
      viewerMembershipState: string
    }
    const list = async (
      params: Record<string, string> = {},
      viewer?: DidString,
    ) =>
      (
        await view<{ boards: Listed[]; cursor?: string }>(
          'com.para.community.listBoards',
          params,
          viewer,
        )
      ).body
    const uris = async (params: Record<string, string> = {}) =>
      (await list(params)).boards.map((board) => board.uri).sort()

    expect(await uris()).toEqual([northUri, southUri, uriOf(east)].sort())
    expect(await uris({ query: 'sur' })).toEqual([southUri])
    expect(await uris({ quadrant: 'centro' })).toHaveLength(3)
    expect(await uris({ quadrant: 'izquierda' })).toEqual([])

    const north = (await list({}, carol)).boards.find(
      (board) => board.uri === northUri,
    )!
    expect(north.memberCount).toBeGreaterThan(1)
    expect(north.viewerMembershipState).toBe('active')
    const south = (await list({}, carol)).boards.find(
      (board) => board.uri === southUri,
    )!
    expect(south.viewerMembershipState).toBe('none')

    // The most populous comes first, and pages do not repeat or skip.
    const bySize = await list({ sort: 'size', limit: '1' })
    expect(bySize.boards.map((board) => board.uri)).toEqual([northUri])
    const next = await list({
      sort: 'size',
      limit: '1',
      cursor: bySize.cursor!,
    })
    expect(next.boards).toHaveLength(1)
    expect(next.boards[0].uri).not.toBe(northUri)

    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await list({ limit: '1', ...(cursor ? { cursor } : {}) })
      seen.push(...page.boards.map((board) => board.uri))
      cursor = page.cursor
    } while (cursor)
    expect(seen.sort()).toEqual([northUri, southUri, uriOf(east)].sort())
  })

  it('lists open offers to the stewards and to whoever they are addressed to', async () => {
    const offers = async (viewer?: DidString, params = {}) =>
      view<{
        offers: Array<{ seq: number; office: string; subject: string }>
        cursor?: string
      }>(
        'com.para.community.listOpenOffers',
        { community: north, ...params },
        viewer,
      )
    const seqs = async (viewer?: DidString) =>
      (await offers(viewer)).body.offers.map((offer) => offer.seq)

    // Earlier tests leave members in various states; start from known ones.
    for (const did of [bob, carol, eve, frank]) {
      const state = await member(did)
      if (state?.status === 'blocked') {
        await take(alice, { action: 'member.unblock', subject: did })
      }
      if (state?.status !== 'active') await take(did, { action: 'member.join' })
    }
    if (!(await member(bob))?.offices.includes('moderator')) {
      const offer = await take(alice, {
        action: 'moderator.offer',
        subject: bob,
      })
      await take(bob, { action: 'moderator.accept', offer })
    }
    expect((await member(carol))?.offices).toEqual([])
    expect((await member(eve))?.offices).toEqual([])
    expect((await member(frank))?.offices).toEqual([])

    const toCarol = await take(alice, {
      action: 'moderator.offer',
      subject: carol,
    })
    const toEve = await take(alice, { action: 'owner.offer', subject: eve })
    const proposal = await take(bob, {
      action: 'sanction.propose',
      subject: frank,
      sanction: 'block',
    })

    // Stewards see everything, newest first.
    expect(await seqs(alice)).toEqual([proposal, toEve, toCarol])
    expect(await seqs(bob)).toEqual([proposal, toEve, toCarol])
    // Others see only what is addressed to them: a proposal to sanction a
    // member is read by the stewards and, if it names them, by the member.
    expect(await seqs(carol)).toEqual([toCarol])
    expect(await seqs(frank)).toEqual([proposal])
    expect(await seqs(gina)).toEqual([])
    expect((await offers(alice)).body.offers[0]).toMatchObject({
      office: 'block',
      subject: frank,
    })
    expect((await offers()).status).toBe(401)

    // Paged by seq.
    const first = await offers(alice, { limit: '2' })
    expect(first.body.offers.map((offer) => offer.seq)).toEqual([
      proposal,
      toEve,
    ])
    expect(
      (
        await offers(alice, { limit: '2', cursor: first.body.cursor! })
      ).body.offers.map((offer) => offer.seq),
    ).toEqual([toCarol])

    // Answering or withdrawing closes them.
    await take(carol, { action: 'moderator.accept', offer: toCarol })
    await take(eve, { action: 'owner.accept', offer: toEve })
    expect(await seqs(alice)).toEqual([proposal])
    await take(alice, {
      action: 'member.block',
      subject: frank,
      offer: proposal,
    })
    expect(await seqs(alice)).toEqual([])
    // Leave the community as it was.
    await take(alice, { action: 'member.unblock', subject: frank })
    await take(frank, { action: 'member.join' })
    await take(carol, { action: 'moderator.resign' })
    await take(eve, { action: 'owner.resign' })
  })

  it('lets only an owner replace the profile, in the commit that records the event', async () => {
    const account = () =>
      db()
        .selectFrom('para_community_account')
        .select(['name', 'description', 'region', 'quadrant', 'createdAt'])
        .where('did', '=', north)
        .executeTakeFirstOrThrow()
    const before = await account()
    const profile = {
      name: 'Norte unido',
      description: 'Un barrio, una voz',
      quadrant: 'centro',
    }
    await refuses(bob, { action: 'profile.update', profile }, 'NotPermitted')
    await refuses(
      alice,
      { action: 'profile.update', profile: { ...profile, name: ' ' } },
      'InvalidProfile',
    )
    await take(alice, { action: 'profile.update', profile })
    expect(await account()).toEqual({
      ...before,
      name: 'Norte unido',
      description: 'Un barrio, una voz',
      region: null,
    })

    // The record carries the new values; its creation date is kept.
    const record = await sc.agent.com.atproto.repo.getRecord({
      repo: north,
      collection: 'com.para.community.profile',
      rkey: 'self',
    })
    expect(record.data.value).toMatchObject({
      ...profile,
      createdAt: before.createdAt,
    })
    // Setting it again, without a region, clears the old one.
    await take(alice, {
      action: 'profile.update',
      profile: { ...profile, name: 'Norte', region: 'CDMX' },
    })
    expect((await account()).region).toBe('CDMX')
    await take(alice, {
      action: 'profile.update',
      profile: { name: 'Norte', quadrant: 'centro' },
    })
    expect(await account()).toMatchObject({
      name: 'Norte',
      description: null,
      region: null,
    })
  })

  it('proves a request held by a member’s own PDS, and refuses one that does not match', async () => {
    elsewhere = await TestPds.create({
      didPlcUrl: network.plc.url,
      inviteRequired: false,
    })
    const agent = elsewhere.getAgent()
    const { data: account } = await agent.createAccount({
      handle: 'remote.test',
      email: 'remote@test.com',
      password: 'remote-pass',
    })
    const remote = account.did as DidString
    const request = async (action: string, subject = remote) => {
      const now = Date.now()
      const { data } = await agent.com.atproto.repo.createRecord({
        repo: remote,
        collection: REQUEST,
        record: {
          $type: REQUEST,
          community: north,
          action,
          subject,
          createdAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
        },
      })
      return { uri: data.uri, cid: data.cid }
    }
    const call = async (body: Record<string, unknown>) =>
      pds(
        remote,
        ACT,
        { community: north, ...body },
        {
          authorization: `Bearer ${await elsewhere.ctx.serviceAuthJwt(remote, north, ACT)}`,
        },
      )

    // The host reads the proof from the member's PDS, not from its own store.
    expect(await call({ action: 'member.join' })).toMatchObject({
      status: 400,
      body: { error: 'InvalidRequest' },
    })
    const leave = await request('member.leave')
    expect(await call({ action: 'member.join', request: leave })).toMatchObject(
      { status: 400, body: { error: 'InvalidRequest' } },
    ) // the request names a different action
    const missing = {
      uri: `at://${remote}/${REQUEST}/3kmissingmissing`,
      cid: leave.cid,
    }
    expect(
      await call({ action: 'member.join', request: missing }),
    ).toMatchObject({ status: 400, body: { error: 'InvalidRequest' } })
    // Someone else's request is not the caller's.
    const aliceRequest = await write(alice, REQUEST, {
      community: north,
      action: 'member.join',
      subject: remote,
      createdAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    })
    expect(
      await call({ action: 'member.join', request: aliceRequest }),
    ).toMatchObject({ status: 400, body: { error: 'InvalidRequest' } })

    const join = await request('member.join')
    const joined = await call({ action: 'member.join', request: join })
    expect(joined).toMatchObject({
      status: 200,
      body: { seq: expect.any(Number) },
    })
    await network.processAll()
    expect(await member(remote)).toMatchObject({ status: 'active' })
    // The AppView checked the same proof when it folded the event.
    const event = await db()
      .selectFrom('para_community_chain_event')
      .select(['status', 'actor'])
      .where('community', '=', north)
      .where('seq', '=', joined.body.seq!)
      .executeTakeFirstOrThrow()
    expect(event).toEqual({ status: 'applied', actor: remote })

    // A request backs one event, even from another PDS.
    expect(await call({ action: 'member.join', request: join })).toMatchObject({
      status: 400,
      body: { error: 'InvalidRequest' },
    })
    // A remote owner-only action is refused by the policy as for anyone.
    const hide = await request('member.remove', carol)
    expect(
      await call({ action: 'member.remove', subject: carol, request: hide }),
    ).toMatchObject({ status: 400, body: { error: 'NotPermitted' } })
  })

  it('rebuilds to the same state, and every action the policy describes was taken', async () => {
    const before = [await snapshot(north), await snapshot(south)]
    expect(before[0].content.length).toBeGreaterThan(0)
    expect(before[0].briefings.length).toBeGreaterThan(0)
    expect(before[0].halves.length).toBeGreaterThan(0)
    for (const community of [north, south]) {
      await network.bsky.db.transaction((txn) =>
        refoldCommunityChain(
          txn,
          chainDeps(),
          community,
          new Date().toISOString(),
        ),
      )
    }
    expect([await snapshot(north), await snapshot(south)]).toEqual(before)

    const events = await db()
      .selectFrom('para_community_chain_event')
      .select(['action', 'status', 'reason'])
      .where('community', 'in', [north, south])
      .execute()
    // Everything the test appended verified.
    expect(events.filter((event) => event.status !== 'applied')).toEqual([])
    const taken = new Set(events.map((event) => event.action))
    const advertised = describeCommunityActions({
      governanceMode: 'hierarchical',
      admissionMode: 'open',
    }).map((a) => a.action)
    expect(advertised.filter((action) => !taken.has(action))).toEqual([])
    expect(taken.has('community.found')).toBe(true)
    expect(COMMUNITY_ACTIONS.filter((action) => !taken.has(action))).toEqual([])
  })
})
