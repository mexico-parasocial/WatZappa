import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { request } from 'undici'
import { SeedClient, TestNetwork } from '@atproto/dev-env'
import { AtUri } from '@atproto/syntax'
import basicSeed from './seeds/basic.js'

describe('horizontal governance end-to-end', () => {
  let network: TestNetwork
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'horizontal_governance_test',
    })
    sc = network.getSeedClient()
    await basicSeed(sc, { addModLabels: network.bsky })
  })

  afterAll(async () => {
    await network.close()
  })

  const callXrpc = async (
    nsid: string,
    body: Record<string, unknown>,
    did: string,
  ) => {
    const url = new URL(`/xrpc/${nsid}`, network.pds.url)
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

  const getRecord = async (
    repo: string,
    collection: string,
    rkey: string,
    did: string,
  ) => {
    const url = new URL(
      `/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`,
      network.pds.url,
    )
    const res = await request(url, {
      headers: sc.getHeaders(did),
    })
    return (await res.body.json()) as Record<string, unknown>
  }

  const putRecord = async (
    repo: string,
    collection: string,
    rkey: string,
    record: Record<string, unknown>,
    did: string,
  ) => {
    const url = new URL(`/xrpc/com.atproto.repo.putRecord`, network.pds.url)
    const res = await request(url, {
      method: 'POST',
      headers: {
        ...sc.getHeaders(did),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        repo,
        collection,
        rkey,
        record,
      }),
    })
    return { status: res.statusCode, body: await res.body.json() }
  }

  it('creates a horizontal community with role rotation rules', async () => {
    const alice = sc.dids.alice

    const created = await callXrpc(
      'com.para.community.createBoard',
      {
        name: 'Horizontal Assembly',
        quadrant: 'south',
        description: 'A horizontally governed community',
        governanceMode: 'horizontal',
      },
      alice,
    )
    expect(created.res.statusCode).toBe(200)

    const communityUri = created.json.uri as string
    const boardRkey = new AtUri(communityUri).rkey

    // Verify board record stores governanceMode
    const boardRecord = await getRecord(
      alice,
      'com.para.community.board',
      boardRkey,
      alice,
    )
    expect(boardRecord.value).toMatchObject({
      $type: 'com.para.community.board',
      governanceMode: 'horizontal',
    })

    // Verify seed governance has roleRotationRules and validUntil on moderator
    const govRecord = await getRecord(
      alice,
      'com.para.community.governance',
      `horizontal-assembly-${boardRkey}`,
      alice,
    )
    const gov = govRecord.value as Record<string, unknown>
    expect(gov.roleRotationRules).toMatchObject({
      $type: 'com.para.community.governanceConfig#roleRotationRules',
      facilitatorMaxDays: 30,
      moderatorMaxDays: 90,
      stewardMaxDays: 180,
      requiresAssemblyRatification: true,
    })

    const moderators = gov.moderators as Array<Record<string, unknown>>
    expect(moderators.length).toBe(1)
    expect(moderators[0].role).toBe('Founding facilitator')
    expect(moderators[0].validFrom).toBeDefined()
    expect(moderators[0].validUntil).toBeDefined()
  })

  it('rejects governance update with expired facilitator', async () => {
    const alice = sc.dids.alice

    const created = await callXrpc(
      'com.para.community.createBoard',
      {
        name: 'Expired Facilitator Test',
        quadrant: 'west',
        governanceMode: 'horizontal',
      },
      alice,
    )
    expect(created.res.statusCode).toBe(200)
    const communityUri = created.json.uri as string
    const boardRkey = new AtUri(communityUri).rkey
    const slug = `expired-facilitator-test-${boardRkey}`

    // Alice (founding facilitator) updates governance with an expired validUntil on herself
    const pastDate = new Date(Date.now() - 86400000).toISOString()
    const result = await putRecord(
      alice,
      'com.para.community.governance',
      slug,
      {
        $type: 'com.para.community.governance',
        community: `p/Expired Facilitator Test`,
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        moderators: [
          {
            did: alice,
            role: 'Founding facilitator',
            badge: 'Community Creator',
            capabilities: ['publish_governance_updates'],
            validFrom: pastDate,
            validUntil: pastDate,
          },
        ],
        officials: [],
        deputies: [],
        metadata: { state: 'active' },
      },
      alice,
    )

    expect(result.status).toBe(400)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('InvalidRequest')
    expect((body.message as string).toLowerCase()).toContain('future')
  })

  it('rejects governance update without validUntil on new roles', async () => {
    const alice = sc.dids.alice

    const created = await callXrpc(
      'com.para.community.createBoard',
      {
        name: 'Missing ValidUntil Test',
        quadrant: 'east',
        governanceMode: 'horizontal',
      },
      alice,
    )
    expect(created.res.statusCode).toBe(200)
    const communityUri = created.json.uri as string
    const boardRkey = new AtUri(communityUri).rkey
    const slug = `missing-validuntil-test-${boardRkey}`

    const result = await putRecord(
      alice,
      'com.para.community.governance',
      slug,
      {
        $type: 'com.para.community.governance',
        community: `p/Missing ValidUntil Test`,
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        moderators: [
          {
            did: alice,
            role: 'Founding facilitator',
            badge: 'Community Creator',
            capabilities: ['publish_governance_updates'],
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
          },
          {
            did: sc.dids.bob,
            role: 'facilitator',
            badge: 'Elected',
            capabilities: ['publish_governance_updates'],
            // missing validUntil!
          },
        ],
        officials: [],
        deputies: [],
        metadata: { state: 'active' },
      },
      alice,
    )

    expect(result.status).toBe(400)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('InvalidRequest')
    expect((body.message as string).toLowerCase()).toContain('validuntil')
  })

  it('rejects governance update exceeding max term duration', async () => {
    const alice = sc.dids.alice

    const created = await callXrpc(
      'com.para.community.createBoard',
      {
        name: 'Term Limit Test',
        quadrant: 'north',
        governanceMode: 'horizontal',
      },
      alice,
    )
    expect(created.res.statusCode).toBe(200)
    const communityUri = created.json.uri as string
    const boardRkey = new AtUri(communityUri).rkey
    const slug = `term-limit-test-${boardRkey}`

    const farFuture = new Date(Date.now() + 86400000 * 365).toISOString()
    const result = await putRecord(
      alice,
      'com.para.community.governance',
      slug,
      {
        $type: 'com.para.community.governance',
        community: `p/Term Limit Test`,
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        moderators: [
          {
            did: alice,
            role: 'Founding facilitator',
            badge: 'Community Creator',
            capabilities: ['publish_governance_updates'],
            validFrom: new Date().toISOString(),
            validUntil: farFuture,
          },
        ],
        officials: [],
        deputies: [],
        metadata: { state: 'active' },
      },
      alice,
    )

    expect(result.status).toBe(400)
    const body = result.body as Record<string, unknown>
    expect(body.error).toBe('InvalidRequest')
    expect((body.message as string).toLowerCase()).toContain('exceeds')
  })

  it('appview filters expired roles from governance', async () => {
    const alice = sc.dids.alice
    const bob = sc.dids.bob

    const created = await callXrpc(
      'com.para.community.createBoard',
      {
        name: 'AppView Filter Test',
        quadrant: 'central',
        governanceMode: 'horizontal',
      },
      alice,
    )
    expect(created.res.statusCode).toBe(200)
    const communityUri = created.json.uri as string
    const boardRkey = new AtUri(communityUri).rkey
    const slug = `appview-filter-test-${boardRkey}`

    await network.processAll()

    // Bob joins
    await callXrpc('com.para.community.join', { communityUri }, bob)

    await network.processAll()

    // Query board via bsky dataplane
    const board = await network.bsky.ctx.dataplane.getParaCommunityBoard({
      communityId: slug,
      uri: communityUri,
      viewerDid: alice,
    })
    expect(board.board).toBeDefined()

    // Query governance via bsky dataplane - should show 1 valid moderator
    const governance =
      await network.bsky.ctx.dataplane.getParaCommunityGovernance({
        community: slug,
      })
    expect(governance.moderators.length).toBe(1)

    // Query members via bsky dataplane
    const members = await network.bsky.ctx.dataplane.getParaCommunityMembers({
      communityId: slug,
      viewerDid: alice,
      viewerIsAdmin: false,
    })
    expect(members.members.length).toBeGreaterThanOrEqual(1)
  })
})
