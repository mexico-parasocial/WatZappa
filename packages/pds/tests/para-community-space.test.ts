import { DAY } from '@atproto/common'
import { type SeedClient, TestNetworkNoAppView } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import type { AppContext } from '../src/index.js'
import {
  communitySpaceUri,
  isCommunitySpaceMember,
  projectCommunitySpace,
} from '../src/para/community/space.js'

/*
 * The member-only space a community account owns (OD-9 §3.11): its member list
 * is a projection of the community's event chain and nothing else writes it.
 */
describe('community spaces', () => {
  let network: TestNetworkNoAppView
  let ctx: AppContext
  let sc: SeedClient
  let alice: string
  let bob: string
  let carol: string
  let community: DidString

  const call = async (nsid: string, did: string, body: object) => {
    const res = await fetch(new URL(`/xrpc/${nsid}`, network.pds.url), {
      method: 'POST',
      headers: {
        ...sc.getHeaders(did as DidString),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as any }
  }

  const act = (did: string, input: object) =>
    call('com.para.community.act', did, { community, ...input })

  const found = async (did: string, slug: string) => {
    const res = await call('com.para.community.create', did, {
      name: slug,
      slug,
      quadrant: 'norte',
    })
    expect(res.status).toBe(200)
    return res.body.did as DidString
  }

  const members = async (of: DidString = community) => {
    const rows = await ctx.actorStore.read(of, (store) =>
      store.space.listMembers(communitySpaceUri(of), { limit: 100 }),
    )
    return rows.map((row) => row.did).sort()
  }

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'para_community_space',
      pds: { spacesEnabled: true },
    })
    ctx = network.pds.ctx
    sc = network.getSeedClient()
    for (const name of ['alice', 'bob', 'carol']) {
      await sc.createAccount(name, {
        handle: `${name}.test`,
        email: `${name}@test.com`,
        password: `${name}-pass`,
      })
    }
    alice = sc.dids.alice
    bob = sc.dids.bob
    carol = sc.dids.carol
    community = await found(alice, 'agua-limpia')
  })

  afterAll(async () => {
    await network.close()
  })

  it('creates the space with the founder as its only member', async () => {
    const config = await ctx.actorStore.read(community, (store) =>
      store.space.getSpaceConfig(communitySpaceUri(community)),
    )
    expect(config).toMatchObject({
      readPolicy: 'member-list',
      writePolicy: 'member-list',
    })
    expect(await members()).toEqual([alice])
  })

  it('admits a member who joins and drops one who leaves', async () => {
    expect((await act(bob, { action: 'member.join' })).status).toBe(200)
    expect(await members()).toEqual([alice, bob].sort())
    expect((await act(bob, { action: 'member.leave' })).status).toBe(200)
    expect(await members()).toEqual([alice])
  })

  it('drops a suspended member in the commit that suspends them', async () => {
    expect((await act(carol, { action: 'member.join' })).status).toBe(200)
    expect(await members()).toEqual([alice, carol].sort())
    const suspended = await act(alice, {
      action: 'member.suspend',
      subject: carol,
      suspensionDays: 1,
    })
    expect(suspended.status).toBe(200)
    expect(await members()).toEqual([alice])
  })

  it('re-admits a member once their suspension has run out', async () => {
    const later = Date.now() + 2 * DAY
    await ctx.actorStore.transact(community, async (txn) => {
      expect(await isCommunitySpaceMember(txn, carol)).toBe(false)
      expect(await isCommunitySpaceMember(txn, carol, later)).toBe(true)
      await projectCommunitySpace(
        txn,
        community,
        { members: [], openedOffers: [], closedOffers: [], effects: [] },
        later,
      )
    })
    expect(await members()).toEqual([alice, carol].sort())
  })

  it('refuses writes to the member list from the generic space routes', async () => {
    // Communities have no session, so nobody can call the owner-only routes
    // as one; the account behind a member's token is never the authority.
    const res = await call('com.atproto.simplespace.addMember', alice, {
      space: communitySpaceUri(community),
      did: bob,
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await members()).not.toContain(bob)
  })

  it('does not reopen a deleted space', async () => {
    const other = await found(bob, 'aire-limpio')
    await ctx.actorStore.transact(other, (txn) =>
      txn.space.deleteSpace(communitySpaceUri(other)),
    )
    community = other
    expect((await act(carol, { action: 'member.join' })).status).toBe(200)
    expect(await members(other)).toEqual([])
    const row = await ctx.actorStore.read(other, (store) =>
      store.space.getSpace(communitySpaceUri(other)),
    )
    expect(row?.deletedAt).toBeTruthy()
  })
})

describe('community spaces disabled', () => {
  let network: TestNetworkNoAppView

  afterAll(async () => {
    await network.close()
  })

  it('creates no space', async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'para_community_space_off',
    })
    const sc = network.getSeedClient()
    await sc.createAccount('alice', {
      handle: 'alice.test',
      email: 'alice@test.com',
      password: 'alice-pass',
    })
    const res = await fetch(
      new URL('/xrpc/com.para.community.create', network.pds.url),
      {
        method: 'POST',
        headers: {
          ...sc.getHeaders(sc.dids.alice as DidString),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Agua',
          slug: 'agua-limpia',
          quadrant: 'norte',
        }),
      },
    )
    const { did } = (await res.json()) as { did: DidString }
    const tables = await network.pds.ctx.actorStore.read(did, (store) =>
      store.space.getSpace(communitySpaceUri(did)).catch(() => null),
    )
    expect(tables).toBeNull()
  })
})
