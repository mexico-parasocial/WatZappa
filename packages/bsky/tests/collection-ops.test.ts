import { describe, expect, it } from 'vitest'
import {
  COLLECTION_LIMITS,
  type CollectionPayload,
  applyCollectionOps,
  validateOpShape,
} from '../src/api/com/para/collection/ops.js'

const at = '2026-01-01T00:00:00.000Z'
const item = (itemId: string, extra: Record<string, unknown> = {}) => ({
  itemId,
  title: itemId,
  addedAt: at,
  ...extra,
})
const relation = (id: string, fromItemId: string, toItemId: string) => ({
  id,
  fromItemId,
  toItemId,
  kind: 'supports',
  createdAt: at,
})
const base = (over: Partial<CollectionPayload> = {}): CollectionPayload => ({
  id: 'c1',
  name: 'Housing',
  items: [],
  relations: [],
  ...over,
})

describe('applyCollectionOps', () => {
  it('applies edits from two devices to the current state, not to a stale copy', () => {
    // Device A and B both read an empty collection, then each add an item.
    // Applied in log order to the current state, both survive.
    const first = applyCollectionOps(
      base(),
      [{ type: 'addItem', item: item('a') }],
      'op1',
    )
    const second = applyCollectionOps(
      first.collection,
      [{ type: 'addItem', item: item('b') }],
      'op2',
    )

    expect(second.collection.items.map((i) => i.itemId)).toEqual(['a', 'b'])
  })

  it('is idempotent, so replaying the log changes nothing', () => {
    const ops = [
      { type: 'addItem', item: item('a') },
      { type: 'addItem', item: item('b') },
      { type: 'addRelation', relation: relation('r1', 'a', 'b') },
    ]
    const once = applyCollectionOps(base(), ops, 'op').collection
    const twice = applyCollectionOps(once, ops, 'op').collection

    expect(twice).toEqual(once)
  })

  it('gives an item without an id the same id on every replay', () => {
    const op = [{ type: 'addItem', item: { title: 'Note', addedAt: at } }]
    const a = applyCollectionOps(base(), op, 'op-x').collection
    const b = applyCollectionOps(base(), op, 'op-x').collection

    expect(a.items[0].itemId).toBe('op-x-0')
    expect(b).toEqual(a)
  })

  it('uses a policy uri as the id of a new policy item', () => {
    const policyUri = 'at://did:plc:a/com.para.civic.cabildeo/1'
    const { collection } = applyCollectionOps(
      base(),
      [{ type: 'addItem', item: { policyUri, addedAt: at } }],
      'op',
    )

    expect(collection.items[0].itemId).toBe(policyUri)
  })

  it('does not add a duplicate policy', () => {
    const policyUri = 'at://did:plc:a/com.para.civic.cabildeo/1'
    const start = base({ items: [{ policyUri, addedAt: at }] })
    const { collection } = applyCollectionOps(
      start,
      [{ type: 'addItem', item: { policyUri, title: 'again', addedAt: at } }],
      'op',
    )

    expect(collection.items).toHaveLength(1)
  })

  it('pins the key before a patch changes the field it derived from', () => {
    const legacy = { url: 'https://old.test', title: 'Old', addedAt: at }
    const start = base({
      items: [legacy, item('b')],
      relations: [relation('r1', 'https://old.test', 'b')],
    })
    const { collection } = applyCollectionOps(
      start,
      [
        {
          type: 'updateItem',
          itemKey: 'https://old.test',
          patch: { url: 'https://new.test' },
        },
      ],
      'op',
    )

    expect(collection.items[0].itemId).toBe('https://old.test')
    expect(collection.items[0].url).toBe('https://new.test')
    expect(collection.relations).toHaveLength(1)
  })

  it('clears a field patched with an empty string', () => {
    const start = base({ items: [item('a', { description: 'text' })] })
    const { collection } = applyCollectionOps(
      start,
      [{ type: 'updateItem', itemKey: 'a', patch: { description: '' } }],
      'op',
    )

    expect(collection.items[0]).not.toHaveProperty('description')
  })

  it('removes an item together with its relations', () => {
    const start = base({
      items: [item('a'), item('b'), item('c')],
      relations: [relation('r1', 'a', 'b'), relation('r2', 'b', 'c')],
    })
    const { collection } = applyCollectionOps(
      start,
      [{ type: 'removeItem', itemKey: 'a' }],
      'op',
    )

    expect(collection.items.map((i) => i.itemId)).toEqual(['b', 'c'])
    expect(collection.relations?.map((r) => r.id)).toEqual(['r2'])
  })

  it('skips a relation to an item that does not exist', () => {
    const start = base({ items: [item('a')] })
    const { collection, skipped } = applyCollectionOps(
      start,
      [{ type: 'addRelation', relation: relation('r1', 'a', 'ghost') }],
      'op',
    )

    expect(collection.relations).toEqual([])
    expect(skipped).toEqual([{ index: 0, reason: 'unknown-item' }])
  })

  it('applies a relation to an item added earlier in the same batch', () => {
    const { collection, skipped } = applyCollectionOps(
      base(),
      [
        { type: 'addItem', item: item('a') },
        { type: 'addItem', item: item('b') },
        { type: 'addRelation', relation: relation('r1', 'a', 'b') },
      ],
      'op',
    )

    expect(skipped).toEqual([])
    expect(collection.relations).toHaveLength(1)
  })

  it('renames, and an empty description clears it', () => {
    const { collection } = applyCollectionOps(
      base({ description: 'old' }),
      [{ type: 'updateDetails', fields: { name: 'Transit', description: '' } }],
      'op',
    )

    expect(collection.name).toBe('Transit')
    expect(collection).not.toHaveProperty('description')
  })

  it('keeps the old name when asked for a blank one', () => {
    const { collection } = applyCollectionOps(
      base(),
      [{ type: 'updateDetails', fields: { name: '   ' } }],
      'op',
    )

    expect(collection.name).toBe('Housing')
  })

  it('refuses an item past the limit but still applies the rest', () => {
    const full = base({
      items: Array.from({ length: COLLECTION_LIMITS.items }, (_, i) =>
        item(`i${i}`),
      ),
    })
    const { collection, skipped } = applyCollectionOps(
      full,
      [
        { type: 'addItem', item: item('one-too-many') },
        { type: 'updateDetails', fields: { name: 'Renamed' } },
      ],
      'op',
    )

    expect(skipped).toEqual([{ index: 0, reason: 'limit' }])
    expect(collection.items).toHaveLength(COLLECTION_LIMITS.items)
    expect(collection.name).toBe('Renamed')
  })

  it('refuses an edit that would exceed the size limit', () => {
    const big = base({
      items: Array.from({ length: 43 }, (_, i) =>
        item(`i${i}`, { description: 'x'.repeat(2000) }),
      ),
    })
    const { skipped } = applyCollectionOps(
      big,
      [{ type: 'addItem', item: item('more', { description: 'y'.repeat(2000) }) }],
      'op',
    )

    expect(skipped).toEqual([{ index: 0, reason: 'limit' }])
  })

  it('does not let one bad op stop the batch', () => {
    const { collection, skipped } = applyCollectionOps(
      base(),
      [
        { type: 'nonsense' },
        { type: 'addItem', item: item('a') },
      ],
      'op',
    )

    expect(skipped).toEqual([{ index: 0, reason: 'invalid' }])
    expect(collection.items).toHaveLength(1)
  })

  it('does not mutate its input', () => {
    const start = base({ items: [item('a')] })
    const snapshot = JSON.stringify(start)
    applyCollectionOps(start, [{ type: 'removeItem', itemKey: 'a' }], 'op')

    expect(JSON.stringify(start)).toBe(snapshot)
  })
})

describe('validateOpShape', () => {
  it.each([
    [{ type: 'addItem' }, 'item'],
    [{ type: 'updateItem', itemKey: 'a' }, 'patch'],
    [{ type: 'removeItem' }, 'itemKey'],
    [{ type: 'addRelation' }, 'relation'],
    [{ type: 'removeRelation' }, 'relationId'],
    [{ type: 'updateDetails' }, 'fields'],
    [{ type: 'explode' }, 'unknown'],
  ])('rejects %j', (op, mention) => {
    expect(validateOpShape(op)).toContain(mention)
  })

  it('accepts a well-formed op', () => {
    expect(validateOpShape({ type: 'removeItem', itemKey: 'a' })).toBeUndefined()
  })
})
