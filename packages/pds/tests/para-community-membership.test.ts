import { request } from 'undici'
import { AtpAgent } from '@atproto/api'
import { SeedClient, TestNetwork } from '@atproto/dev-env'
import { AtUri } from '@atproto/syntax'
import basicSeed from './seeds/basic.js'

describe('para community membership', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'para_community_membership',
    })
    agent = network.pds.getClient()
    sc = network.getSeedClient()
    await basicSeed(sc, { addModLabels: network.bsky })
  })

  afterAll(async () => {
    await network.close()
  })

  const callProcedure = async (
    nsid: string,
    body: Record<string, unknown>,
    did: string,
  ) => {
    const url = new URL(`/xrpc/${nsid}`, agent.dispatchUrl)
    const res = await request(url, {
      method: 'POST',
      headers: {
        ...sc.getHeaders(did),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = (await res.body.json()) as Record<string, unknown>
    return { res, json }
  }

  it('joins and leaves a community using membership records', async () => {
    const alice = sc.dids.alice
    const bob = sc.dids.bob

    const created = await callProcedure(
      'com.para.community.createBoard',
      {
        name: 'Neighborhood Budget',
        quadrant: 'north',
        description: 'Local participatory budget board',
      },
      alice,
    )
    expect(created.res.statusCode).toBe(200)
    const communityUri = created.json.uri as string

    const joined = await callProcedure(
      'com.para.community.join',
      { communityUri },
      bob,
    )
    expect(joined.res.statusCode).toBe(200)
    expect(joined.json.communityUri).toBe(communityUri)
    expect(joined.json.membershipState).toBe('active')
    expect(joined.json.viewerCapabilities).toEqual(
      expect.arrayContaining(['create_community', 'leave_community']),
    )

    const joinedUri = new AtUri(joined.json.uri as string)
    const storedJoin = await agent.api.com.atproto.repo.getRecord(
      {
        repo: bob,
        collection: 'com.para.community.membership',
        rkey: joinedUri.rkey,
      },
      { headers: sc.getHeaders(bob) },
    )
    expect(storedJoin.data.value).toMatchObject({
      $type: 'com.para.community.membership',
      community: communityUri,
      membershipState: 'active',
    })

    const left = await callProcedure(
      'com.para.community.leave',
      { communityUri },
      bob,
    )
    expect(left.res.statusCode).toBe(200)
    expect(left.json.uri).toBe(joined.json.uri)
    expect(left.json.membershipState).toBe('left')
    expect(left.json.viewerCapabilities).toEqual(
      expect.arrayContaining(['create_community', 'join_community']),
    )

    const storedLeave = await agent.api.com.atproto.repo.getRecord(
      {
        repo: bob,
        collection: 'com.para.community.membership',
        rkey: joinedUri.rkey,
      },
      { headers: sc.getHeaders(bob) },
    )
    expect(storedLeave.data.value).toMatchObject({
      $type: 'com.para.community.membership',
      community: communityUri,
      membershipState: 'left',
    })
    expect(storedLeave.data.value).toHaveProperty('leftAt')
  })
})
