// @ts-nocheck
import { request } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  TestNetwork,
  createCommunityBoardRecord,
  usersSeed,
} from '@atproto/dev-env'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// `protectedAction` is a claim the record makes about what its assembly is
// asked to decide. The view repeats it when well formed and drops it
// otherwise; it never grants anything by itself.
maybeDescribe('cabildeo protectedAction', () => {
  let network: TestNetwork
  let sc: ReturnType<TestNetwork['getSeedClient']>
  let community: string

  const NSID = 'com.para.civic.getCabildeo'

  const write = async (protectedAction?: unknown) => {
    const { data } = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: sc.dids.alice,
        collection: 'com.para.civic.cabildeo',
        record: {
          $type: 'com.para.civic.cabildeo',
          title: 'Elegir moderación',
          description: 'La asamblea decide.',
          community,
          phase: 'deliberating',
          options: [{ label: 'Sí' }, { label: 'No' }],
          ...(protectedAction === undefined ? {} : { protectedAction }),
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(sc.dids.alice) },
    )
    await network.processAll()
    return data.uri as string
  }

  const view = async (uri: string) => {
    const url = new URL(`/xrpc/${NSID}`, network.bsky.url)
    url.searchParams.set('cabildeo', uri)
    const res = await request(url, {
      headers: await network.serviceHeaders(sc.dids.bob, NSID),
    })
    if (res.statusCode !== 200) {
      throw new Error(`Expected 200 from ${NSID}, got ${res.statusCode}`)
    }
    return ((await res.body.json()) as any).cabildeo
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'cabildeo_protected_action_test',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    await network.processAll()
    const board = await createCommunityBoardRecord(sc, sc.dids.alice, {
      name: 'Protected Action',
      quadrant: 'civic',
    })
    community = `protected-action-${board.uri.split('/').pop()}`
  })

  afterAll(async () => {
    await network?.close()
  })

  it('serves a well-formed claim', async () => {
    const uri = await write({
      action: 'moderator.elect',
      subject: sc.dids.carol,
      payloadHash: 'sha256-abc',
    })
    expect((await view(uri)).protectedAction).toEqual({
      action: 'moderator.elect',
      subject: sc.dids.carol,
      payloadHash: 'sha256-abc',
    })
  })

  it('drops a claim whose subject is not a DID', async () => {
    const uri = await write({ action: 'moderator.elect', subject: 'carol' })
    expect((await view(uri)).protectedAction).toBeUndefined()
  })

  it('serves nothing when the record claims nothing', async () => {
    const uri = await write()
    expect((await view(uri)).protectedAction).toBeUndefined()
  })
})
