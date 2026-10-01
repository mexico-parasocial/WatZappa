/*
 * Edits to a personal civic tree collection, as operations.
 *
 * `updateCollection` replaces the whole collection, so a client that sends back
 * what it read a moment ago erases anything written since. `applyOps` instead
 * records edits in the bsync log and the appview applies each one to the
 * collection's *current* state, in log order, so edits from different devices
 * merge rather than overwrite.
 *
 * This runs both when a request is accepted (shape checks and an approximate
 * limit check) and when the subscription indexes the log, including on every
 * replay after a restart. It therefore has to be a pure, deterministic fold:
 * no clock, no randomness, and every op idempotent. The PARA client has a
 * matching reducer (src/state/queries/collection-ops.ts) for optimistic
 * updates; keep the two in step.
 */

export type CollectionItem = {
  itemId?: string
  title?: string
  url?: string
  policyUri?: string
  addedAt?: string
  [field: string]: unknown
}

export type CollectionRelation = {
  id: string
  fromItemId: string
  toItemId: string
  [field: string]: unknown
}

export type CollectionPayload = {
  id: string
  name: string
  description?: string
  color?: string
  items: CollectionItem[]
  relations?: CollectionRelation[]
}

export type CollectionOp = {
  type: string
  item?: CollectionItem
  itemKey?: string
  patch?: Record<string, unknown>
  relation?: CollectionRelation
  relationId?: string
  fields?: { name?: string; description?: string; color?: string }
}

export const COLLECTION_LIMITS = {
  items: 500,
  relations: 2000,
  // The bsky server accepts request bodies up to 100 kB; stay under it so a
  // collection that grows through ops can still be written by updateCollection.
  bytes: 90_000,
} as const

export type SkipReason = 'invalid' | 'unknown-item' | 'limit'

export type ApplyResult = {
  collection: CollectionPayload
  skipped: { index: number; reason: SkipReason }[]
}

const itemKey = (item: CollectionItem): string =>
  item.itemId ||
  item.policyUri ||
  item.url ||
  `${item.title ?? ''}-${item.addedAt ?? ''}`

const isSameItem = (a: CollectionItem, b: CollectionItem): boolean => {
  if (itemKey(a) === itemKey(b)) return true
  if (a.policyUri && a.policyUri === b.policyUri) return true
  if (!a.itemId && a.url && a.url === b.url) return true
  return false
}

const sizeOf = (c: CollectionPayload): number => JSON.stringify(c).length

/** Returns an error message if the op is malformed, else undefined. */
export const validateOpShape = (op: CollectionOp): string | undefined => {
  switch (op.type) {
    case 'addItem':
      return op.item ? undefined : 'addItem requires item'
    case 'updateItem':
      return op.itemKey && op.patch
        ? undefined
        : 'updateItem requires itemKey and patch'
    case 'removeItem':
      return op.itemKey ? undefined : 'removeItem requires itemKey'
    case 'addRelation':
      return op.relation ? undefined : 'addRelation requires relation'
    case 'removeRelation':
      return op.relationId ? undefined : 'removeRelation requires relationId'
    case 'updateDetails':
      return op.fields ? undefined : 'updateDetails requires fields'
    default:
      return `unknown op type: ${op.type}`
  }
}

/**
 * Applies `ops` in order. An op that cannot apply (malformed, dangling
 * relation, over a limit) is skipped and reported; it never aborts the batch,
 * because the log is replayed and one bad op must not wedge a collection.
 *
 * `opKey` seeds ids for items that arrive without one, so a replay produces the
 * same ids as the first run.
 */
export const applyCollectionOps = (
  input: CollectionPayload,
  ops: CollectionOp[],
  opKey: string,
): ApplyResult => {
  let collection: CollectionPayload = {
    ...input,
    items: input.items ?? [],
    relations: input.relations ?? [],
  }
  const skipped: ApplyResult['skipped'] = []

  ops.forEach((op, index) => {
    const skip = (reason: SkipReason) => skipped.push({ index, reason })
    if (validateOpShape(op)) return skip('invalid')

    const relations = collection.relations ?? []
    let next: CollectionPayload | undefined

    switch (op.type) {
      case 'addItem': {
        const item = op.item as CollectionItem
        if (collection.items.some((existing) => isSameItem(existing, item))) {
          return // already present: idempotent, not an error
        }
        if (collection.items.length >= COLLECTION_LIMITS.items) {
          return skip('limit')
        }
        next = {
          ...collection,
          items: [
            ...collection.items,
            item.itemId
              ? item
              : { ...item, itemId: item.policyUri || `${opKey}-${index}` },
          ],
        }
        break
      }

      case 'updateItem': {
        let found = false
        const items = collection.items.map((item) => {
          if (itemKey(item) !== op.itemKey) return item
          found = true
          const patched: CollectionItem = {
            ...item,
            // Pin the key before patching so relations stay attached when the
            // patched field (url, policyUri) is what the key derived from.
            itemId: item.itemId ?? op.itemKey,
          }
          for (const [field, value] of Object.entries(op.patch ?? {})) {
            if (field === 'itemId' || field === 'addedAt') continue
            if (value === '' || value === null) delete patched[field]
            else patched[field] = value
          }
          return patched
        })
        if (!found) return skip('unknown-item')
        next = { ...collection, items }
        break
      }

      case 'removeItem':
        next = {
          ...collection,
          items: collection.items.filter((i) => itemKey(i) !== op.itemKey),
          relations: relations.filter(
            (r) => r.fromItemId !== op.itemKey && r.toItemId !== op.itemKey,
          ),
        }
        break

      case 'addRelation': {
        const relation = op.relation as CollectionRelation
        if (relations.some((r) => r.id === relation.id)) return
        const keys = new Set(collection.items.map(itemKey))
        if (!keys.has(relation.fromItemId) || !keys.has(relation.toItemId)) {
          return skip('unknown-item')
        }
        if (relations.length >= COLLECTION_LIMITS.relations) {
          return skip('limit')
        }
        next = { ...collection, relations: [...relations, relation] }
        break
      }

      case 'removeRelation':
        next = {
          ...collection,
          relations: relations.filter((r) => r.id !== op.relationId),
        }
        break

      case 'updateDetails': {
        const { name, description, color } = op.fields ?? {}
        next = { ...collection }
        if (name !== undefined && name.trim()) next.name = name
        if (description !== undefined) {
          if (description === '') delete next.description
          else next.description = description
        }
        if (color !== undefined) next.color = color
        break
      }
    }

    if (!next) return
    if (sizeOf(next) > COLLECTION_LIMITS.bytes) return skip('limit')
    collection = next
  })

  return { collection, skipped }
}
