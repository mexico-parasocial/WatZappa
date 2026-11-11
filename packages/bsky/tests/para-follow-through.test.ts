import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  usersSeed,
} from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

const DAY = 24 * 60 * 60 * 1000
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()

type View = {
  uri: string
  title: string
  status: string
  progress?: number
  overdue: boolean
  edited: boolean
  createdAt: string
  withdrawnUpdates?: number
  children?: View[]
  updates?: { note?: string; author: string }[]
}
type Summary = { cabildeo: string; total: number; completed: number }
type List = { items: View[]; summaries: Summary[]; cursor?: string }

// Compromisos are served only for a followable cabildeo, only when written by a
// current steward of its community, and only as first committed.
maybeDescribe('follow-through (AppView)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // board creator, so a steward
  let dan: DidString // outsider
  let board: string
  let cabildeo: string
  let createdAt = Date.now()

  const xrpc = async <T>(nsid: string, params: Record<string, string>) => {
    const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    const res = await fetch(url)
    return { status: res.status, body: (await res.json()) as T }
  }
  const list = async (params: Record<string, string>) =>
    (await xrpc<List>('com.para.civic.listFollowThrough', params)).body
  const get = (uri: string) =>
    xrpc<{ item: View; error?: string }>('com.para.civic.getFollowThrough', {
      uri,
    })
  const titles = (items: View[]) => items.map((item) => item.title)

  const write = async (
    by: DidString,
    collection: string,
    record: Record<string, unknown>,
  ) => {
    const { data } = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: by,
        collection,
        record: { $type: collection, ...record },
      },
      { encoding: 'application/json', headers: sc.getHeaders(by) },
    )
    return data.uri
  }
  const rkey = (uri: string) => uri.split('/').pop() as string

  /** A resolved cabildeo; the tally columns are fixtures a vote journey would fill. */
  const resolvedCabildeo = async (
    overrides: {
      kind?: string
      minQuorum?: number
      winningOption?: number
      voteCount?: number
    } = {},
  ) => {
    const uri = await write(alice, 'com.para.civic.cabildeo', {
      title: 'Parque en la colonia',
      description: 'Qué hacer con el terreno baldío.',
      community: board,
      phase: 'resolved',
      options: [{ label: 'Nada' }, { label: 'Parque' }],
      createdAt: new Date().toISOString(),
      ...(overrides.kind && { kind: overrides.kind }),
      ...(overrides.minQuorum && { minQuorum: overrides.minQuorum }),
    })
    await network.processAll()
    await network.bsky.db.db
      .updateTable('cabildeo_cabildeo')
      .where('uri', '=', uri)
      .set({
        winningOption: overrides.winningOption ?? 1,
        isTie: 0,
        voteCount: overrides.voteCount ?? 3,
      })
      .execute()
    return uri
  }

  const item = (
    by: DidString,
    title: string,
    opts: {
      cabildeo?: string
      optionIndex?: number
      parent?: string
      dueAt?: string
    } = {},
  ) =>
    write(by, 'com.para.civic.followThrough', {
      cabildeo: opts.cabildeo ?? cabildeo,
      communityUri: board,
      optionIndex: opts.optionIndex ?? 1,
      title,
      ...(opts.parent && { parent: opts.parent }),
      ...(opts.dueAt && { dueAt: opts.dueAt }),
      createdAt: new Date((createdAt += 1000)).toISOString(),
    })

  const progress = (
    by: DidString,
    subject: string,
    fields: Record<string, unknown>,
  ) =>
    write(by, 'com.para.civic.followThroughUpdate', {
      subject,
      status: 'in_progress',
      occurredAt: new Date((createdAt += 1000)).toISOString(),
      createdAt: new Date().toISOString(),
      ...fields,
    })

  let park: string
  let lights: string

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'para_follow_through_test',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, dan } = sc.dids)
    board = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Follow Through Board',
        quadrant: 'center',
      })
    ).uri
    await network.processAll()
    cabildeo = await resolvedCabildeo()
  })

  afterAll(async () => {
    await network.close()
  })

  it("serves a steward's compromisos with their children", async () => {
    park = await item(alice, 'Construir el parque', {
      dueAt: inDays(-10),
    })
    lights = await item(alice, 'Instalar luminarias', { parent: park })
    await item(alice, 'Cercar el terreno', { parent: park })
    await network.processAll()

    const res = await list({ cabildeo })
    expect(titles(res.items)).toEqual(['Construir el parque'])
    expect(titles(res.items[0].children ?? [])).toEqual([
      'Instalar luminarias',
      'Cercar el terreno',
    ])
    expect(res.summaries).toEqual([
      expect.objectContaining({ cabildeo, total: 1, completed: 0 }),
    ])
  })

  it('ignores an outsider and a compromiso for the wrong option', async () => {
    const outsider = await item(dan, 'Prometer un estadio')
    await item(alice, 'Dejar el terreno como está', { optionIndex: 0 })
    await network.processAll()

    expect(titles((await list({ cabildeo })).items)).toEqual([
      'Construir el parque',
    ])
    const res = await get(outsider)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('NotFound')
  })

  it('takes updates from stewards only and rolls them up', async () => {
    await progress(alice, lights, { status: 'completed' })
    await progress(dan, lights, { status: 'abandoned', note: 'cancelado' })
    await network.processAll()

    const [root] = (await list({ cabildeo })).items
    expect(root.status).toBe('in_progress')
    expect(root.children?.map((c) => c.status)).toEqual([
      'completed',
      'planned',
    ])
    expect(root.progress).toBe(50)
  })

  it('derives overdue from the due date and filters on it', async () => {
    const overdue = await list({ cabildeo, overdue: 'true' })
    expect(titles(overdue.items)).toEqual(['Construir el parque'])
    expect(overdue.items[0].overdue).toBe(true)
    expect((await list({ cabildeo, status: 'completed' })).items).toEqual([])
  })

  it('serves the first version of an edited compromiso, flagged', async () => {
    const { item: original } = (await get(park)).body
    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: alice,
        collection: 'com.para.civic.followThrough',
        rkey: rkey(park),
        record: {
          $type: 'com.para.civic.followThrough',
          cabildeo,
          communityUri: board,
          optionIndex: 1,
          title: 'Construir un estacionamiento',
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()

    const { item: edited } = (await get(park)).body
    expect(edited.title).toBe('Construir el parque')
    expect(edited.edited).toBe(true)
    // The date is committed too, or an edit could move a cabildeo up the list.
    expect(edited.createdAt).toBe(original.createdAt)
  })

  it('reports a deleted update as withdrawn', async () => {
    const note = await progress(alice, park, { note: 'Primera visita' })
    await network.processAll()
    expect((await get(park)).body.item.updates?.map((u) => u.note)).toContain(
      'Primera visita',
    )

    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.followThroughUpdate',
        rkey: rkey(note),
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()

    const { item: after } = (await get(park)).body
    expect(after.updates?.map((u) => u.note)).not.toContain('Primera visita')
    expect(after.withdrawnUpdates).toBe(1)
  })

  it('follows only an activity that met its quorum', async () => {
    const forum = await resolvedCabildeo({ kind: 'forum' })
    await item(alice, 'No debería verse', { cabildeo: forum })
    const quorum = await resolvedCabildeo({ minQuorum: 5, voteCount: 3 })
    await item(alice, 'Esperar el quórum', { cabildeo: quorum })
    await network.processAll()

    expect((await list({ cabildeo: forum })).items).toEqual([])
    expect((await list({ cabildeo: quorum })).items).toEqual([])

    await network.bsky.db.db
      .updateTable('cabildeo_cabildeo')
      .where('uri', '=', quorum)
      .set({ voteCount: 5 })
      .execute()
    expect(titles((await list({ cabildeo: quorum })).items)).toEqual([
      'Esperar el quórum',
    ])
  })

  it('pages a community by cabildeo, newest first', async () => {
    const first = await list({ community: board, limit: '1' })
    expect(titles(first.items)).toEqual(['Esperar el quórum'])
    expect(first.cursor).toBeDefined()

    const second = await list({
      community: board,
      limit: '1',
      cursor: first.cursor as string,
    })
    expect(titles(second.items)).toEqual(['Construir el parque'])
    expect(second.cursor).toBeUndefined()
  })

  it('never serves a createdAt from the future', async () => {
    const own = await resolvedCabildeo()
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const uri = await write(alice, 'com.para.civic.followThrough', {
      cabildeo: own,
      communityUri: board,
      optionIndex: 1,
      title: 'Fecha del futuro',
      createdAt: future.toISOString(),
    })
    await network.processAll()
    const { item } = (await get(uri)).body
    expect(Date.parse(item.createdAt)).toBeLessThanOrEqual(Date.now())
  })
})
