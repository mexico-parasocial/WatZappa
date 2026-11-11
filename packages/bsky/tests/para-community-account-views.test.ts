import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// OD-9 phase 3: every membership and office answer for a community account
// comes from its folded chain, through the AppView's own endpoints.
maybeDescribe('community account views (OD-9)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // founder
  let bob: DidString // moderator
  let carol: DidString // suspended member
  let dan: DidString // outsider
  let community: DidString
  let uri: string
  let handle: string

  const pds = async (
    by: DidString,
    nsid: string,
    body: Record<string, unknown>,
  ) => {
    const res = await fetch(new URL(`/xrpc/${nsid}`, network.pds.url), {
      method: 'POST',
      headers: { ...sc.getHeaders(by), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    return (await res.json()) as Record<string, unknown>
  }
  const act = (by: DidString, input: Record<string, unknown>) =>
    pds(by, 'com.para.community.act', { community, ...input })

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

  const authorization = async (viewer: DidString, action: string) =>
    (
      await view<{ roles: string[]; authorization: { status: string } }>(
        'com.para.community.getAuthorization',
        { community: uri, action },
        viewer,
      )
    ).body

  const memberDids = async (params: Record<string, string> = {}) => {
    const { status, body } = await view<{ members: Array<{ did: string }> }>(
      'com.para.community.listMembers',
      { communityId: handle, ...params },
      alice,
    )
    expect({ status, body }).toMatchObject({ status: 200 })
    return body.members.map((member) => member.did).sort()
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_community_account_views_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)
    const created = await pds(alice, 'com.para.community.create', {
      name: 'Vista Hermosa',
      slug: 'vista-hermosa',
      quadrant: 'poniente',
    })
    community = created.did as DidString
    uri = created.uri as string
    handle = created.handle as string
    for (const did of [bob, carol]) await act(did, { action: 'member.join' })
    const offer = await act(alice, { action: 'moderator.offer', subject: bob })
    await act(bob, { action: 'moderator.accept', offer: offer.seq })
    await act(bob, {
      action: 'member.suspend',
      subject: carol,
      suspensionDays: 1,
    })
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('serves the board view from the folded chain', async () => {
    const { status, body } = await view<{
      board: {
        uri: string
        name: string
        memberCount: number
        viewerRoles: string[]
        creatorDid: string
        governanceSummary?: { moderatorCount: number }
      }
    }>('com.para.community.getBoard', { uri }, bob)
    expect(status).toBe(200)
    expect(body.board).toMatchObject({
      uri,
      name: 'Vista Hermosa',
      creatorDid: alice,
      // carol is suspended, so not counted as an active member.
      memberCount: 2,
      governanceSummary: { moderatorCount: 1 },
    })
    expect(body.board.viewerRoles.sort()).toEqual(['member', 'moderator'])
  })

  it('authorizes by office, and not while suspended', async () => {
    expect(await authorization(bob, 'content.moderate')).toMatchObject({
      authorization: { status: 'allowed' },
    })
    expect(await authorization(carol, 'content.moderate')).toMatchObject({
      roles: [],
      authorization: { status: 'denied' },
    })
    expect(await authorization(dan, 'content.create')).toMatchObject({
      roles: [],
      authorization: { status: 'denied' },
    })
  })

  it('lists members by state and office, for members only', async () => {
    expect(await memberDids()).toEqual([alice, bob].sort())
    expect(await memberDids({ role: 'moderator' })).toEqual([bob])
    expect(await memberDids({ role: 'owner' })).toEqual([alice])
    expect(await memberDids({ membershipState: 'suspended' })).toEqual([carol])
    const outsider = await view(
      'com.para.community.listMembers',
      { communityId: handle },
      dan,
    )
    expect(outsider.status).not.toBe(200)
  })

  it('pages members in join order', async () => {
    const first = await view<{
      members: Array<{ did: string }>
      cursor?: string
    }>(
      'com.para.community.listMembers',
      { communityId: handle, limit: '1' },
      alice,
    )
    expect(first.body.members.map((m) => m.did)).toHaveLength(1)
    expect(first.body.cursor).toBeTruthy()
    const second = await view<{ members: Array<{ did: string }> }>(
      'com.para.community.listMembers',
      { communityId: handle, limit: '1', cursor: first.body.cursor! },
      alice,
    )
    expect(
      [...first.body.members, ...second.body.members].map((m) => m.did).sort(),
    ).toEqual([alice, bob].sort())
  })

  it('lists officers only from verified state', async () => {
    const { status, body } = await view<{
      roleHolders: Array<{ did: string; role: string }>
      moderators: Array<{ did: string; role: string }>
      officials: unknown[]
    }>('com.para.community.getGovernance', { community: 'vista-hermosa' })
    expect(status).toBe(200)
    expect(
      body.roleHolders
        .filter((holder) => holder.role !== 'member')
        .map(({ did, role }) => ({ did, role }))
        .sort((a, b) => a.role.localeCompare(b.role)),
    ).toEqual([
      { did: bob, role: 'moderator' },
      { did: alice, role: 'owner' },
    ])
    expect(body.moderators.map((m) => ({ did: m.did, role: m.role }))).toEqual([
      { did: alice, role: 'owner' },
      { did: bob, role: 'moderator' },
    ])
    expect(body.officials).toEqual([])
  })

  it('counts and gates policy votes by active membership', async () => {
    const params = {
      community: handle,
      post: `at://${alice}/com.para.post/3kpolicy`,
    }
    const nsid = 'com.para.civic.getPolicyCommunityVotes'
    const member = await view<{ memberCount: number; voterCount: number }>(
      nsid,
      params,
      alice,
    )
    expect(member).toMatchObject({
      status: 200,
      body: { memberCount: 2, voterCount: 0 },
    })
    // A suspended member is not an active one.
    expect((await view(nsid, params, carol)).status).not.toBe(200)
    expect((await view(nsid, params, dan)).status).not.toBe(200)
  })

  it('drops a member who leaves, offices included', async () => {
    await act(bob, { action: 'member.leave' })
    await network.processAll()
    expect(await authorization(bob, 'content.moderate')).toMatchObject({
      roles: [],
      authorization: { status: 'denied' },
    })
    expect(await memberDids()).toEqual([alice])
    expect(await memberDids({ membershipState: 'left' })).toEqual([bob])
  })
})
