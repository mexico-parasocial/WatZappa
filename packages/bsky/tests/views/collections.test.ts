// @ts-nocheck
import { AtpAgent } from '@atproto/api'
import { SeedClient, TestNetwork, basicSeed } from '@atproto/dev-env'

/*
 * Personal civic tree collections travel PutOperation -> bsync -> the appview's
 * BsyncSubscription -> the `collection` table. Only the subscription branch for
 * the collection namespace makes a written collection readable; this guards it.
 */
describe('appview collections', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient
  let alice: string
  let bob: string

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'bsky_views_collections',
    })
    agent = network.bsky.getAgent()
    sc = network.getSeedClient()
    await basicSeed(sc)
    await network.processAll()
    alice = sc.dids.alice
    bob = sc.dids.bob
  })

  afterAll(async () => {
    await network.close()
  })

  const call = async (
    actor: string,
    nsid: string,
    params: Record<string, unknown>,
    data?: unknown,
  ) =>
    agent.call(nsid, params, data, {
      headers: await network.serviceHeaders(actor, nsid),
    })

  const create = async (actor: string, name: string) => {
    const res = await call(actor, 'com.para.collection.createCollection', {}, {
      name,
    })
    await network.processAll()
    return res.data.id as string
  }

  it('makes a created collection readable', async () => {
    const id = await create(alice, 'Housing')

    const got = await call(alice, 'com.para.collection.getCollection', { id })
    expect(got.data.collection).toMatchObject({
      id,
      name: 'Housing',
      items: [],
      relations: [],
    })

    const list = await call(alice, 'com.para.collection.listCollections', {})
    expect(list.data.collections.map((c) => c.id)).toContain(id)
  })

  it('reflects an update', async () => {
    const id = await create(alice, 'Transit')
    await call(
      alice,
      'com.para.collection.updateCollection',
      {},
      {
        id,
        collection: {
          id,
          name: 'Transit & Roads',
          items: [{ itemId: 'i1', title: 'Bus lanes', addedAt: new Date().toISOString() }],
          relations: [],
        },
      },
    )
    await network.processAll()

    const got = await call(alice, 'com.para.collection.getCollection', { id })
    expect(got.data.collection.name).toBe('Transit & Roads')
    expect(got.data.collection.items).toHaveLength(1)
  })

  it('removes a deleted collection', async () => {
    const id = await create(alice, 'Temporary')
    await call(alice, 'com.para.collection.deleteCollection', {}, { id })
    await network.processAll()

    await expect(
      call(alice, 'com.para.collection.getCollection', { id }),
    ).rejects.toMatchObject({ error: 'NotFound' })
  })

  it('keeps collections private to their owner', async () => {
    const id = await create(alice, 'Private')

    await expect(
      call(bob, 'com.para.collection.getCollection', { id }),
    ).rejects.toMatchObject({ error: 'NotFound' })
    const list = await call(bob, 'com.para.collection.listCollections', {})
    expect(list.data.collections.map((c) => c.id)).not.toContain(id)
  })

  describe('applyOps', () => {
    const at = new Date().toISOString()
    const item = (itemId: string) => ({ itemId, title: itemId, addedAt: at })
    // The test agent's lexicon set predates applyOps, so call it over HTTP.
    const apply = async (actor: string, id: string, ops: unknown[]) => {
      const nsid = 'com.para.collection.applyOps'
      const res = await fetch(`${network.bsky.url}/xrpc/${nsid}`, {
        method: 'POST',
        headers: {
          ...(await network.serviceHeaders(actor, nsid)),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id, ops }),
      })
      const body = await res.json()
      if (!res.ok) throw Object.assign(new Error(body.message), body)
      return { data: body }
    }
    const read = async (actor: string, id: string) =>
      (await call(actor, 'com.para.collection.getCollection', { id })).data
        .collection

    it('applies items and a relation, in order', async () => {
      const id = await create(alice, 'Ops')
      const res = await apply(alice, id, [
        { type: 'addItem', item: item('a') },
        { type: 'addItem', item: item('b') },
        {
          type: 'addRelation',
          relation: {
            id: 'r1',
            fromItemId: 'a',
            toItemId: 'b',
            kind: 'supports',
            createdAt: at,
          },
        },
      ])
      await network.processAll()

      expect(res.data.opId).toBeTruthy()
      const got = await read(alice, id)
      expect(got.items.map((i) => i.itemId)).toEqual(['a', 'b'])
      expect(got.relations.map((r) => r.id)).toEqual(['r1'])
    })

    it('merges edits from two devices that never read each other', async () => {
      const id = await create(alice, 'Two devices')
      // Neither call reads the collection first, which is what made
      // updateCollection lose one of them.
      await Promise.all([
        apply(alice, id, [{ type: 'addItem', item: item('from-phone') }]),
        apply(alice, id, [{ type: 'addItem', item: item('from-laptop') }]),
      ])
      await network.processAll()

      const got = await read(alice, id)
      expect(got.items.map((i) => i.itemId).sort()).toEqual([
        'from-laptop',
        'from-phone',
      ])
    })

    it('removes an item and the relations that touched it', async () => {
      const id = await create(alice, 'Removal')
      await apply(alice, id, [
        { type: 'addItem', item: item('a') },
        { type: 'addItem', item: item('b') },
        {
          type: 'addRelation',
          relation: {
            id: 'r1',
            fromItemId: 'a',
            toItemId: 'b',
            kind: 'supports',
            createdAt: at,
          },
        },
      ])
      await apply(alice, id, [{ type: 'removeItem', itemKey: 'a' }])
      await network.processAll()

      const got = await read(alice, id)
      expect(got.items.map((i) => i.itemId)).toEqual(['b'])
      expect(got.relations).toEqual([])
    })

    it('renames without disturbing items', async () => {
      const id = await create(alice, 'Before')
      await apply(alice, id, [{ type: 'addItem', item: item('a') }])
      await apply(alice, id, [
        { type: 'updateDetails', fields: { name: 'After' } },
      ])
      await network.processAll()

      const got = await read(alice, id)
      expect(got.name).toBe('After')
      expect(got.items).toHaveLength(1)
    })

    it('rejects an unknown collection', async () => {
      await expect(
        apply(alice, 'does-not-exist', [{ type: 'addItem', item: item('a') }]),
      ).rejects.toMatchObject({ error: 'NotFound' })
    })

    it("cannot edit someone else's collection", async () => {
      const id = await create(alice, 'Mine')

      await expect(
        apply(bob, id, [{ type: 'addItem', item: item('intruder') }]),
      ).rejects.toMatchObject({ error: 'NotFound' })
      await network.processAll()
      expect((await read(alice, id)).items).toEqual([])
    })

    it('rejects a malformed op', async () => {
      const id = await create(alice, 'Malformed')

      await expect(apply(alice, id, [{ type: 'addItem' }])).rejects.toThrow(
        /requires item/,
      )
    })
  })
})
