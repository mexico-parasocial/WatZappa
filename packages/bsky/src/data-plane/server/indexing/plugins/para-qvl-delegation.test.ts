import { describe, expect, it, vi } from 'vitest'
import { AtUri } from '@atproto/syntax'
import { makePlugin } from './para-qvl-delegation.js'

const processor = vi.hoisted(() => ({ options: undefined as any }))
vi.mock('../processor.js', () => ({
  RecordProcessor: class {
    constructor(_db: unknown, _background: unknown, options: unknown) {
      processor.options = options
    }
  },
}))

describe('delegation repository authority', () => {
  const owner = 'did:plc:owner'
  const uri = new AtUri(`at://${owner}/com.para.community.delegation/1`)
  const record = {
    delegator: owner,
    delegate: 'did:plc:delegate',
    scope: { mode: 'topic', topic: 'budget' },
    createdAt: '2026-09-20T00:00:00.000Z',
  }

  it.each([
    { ...record, delegator: 'did:plc:victim' },
    { ...record, delegate: owner },
  ])('does not index forged or self-delegated power', async (input) => {
    makePlugin({} as never, {} as never)
    const insertInto = vi.fn()
    const result = await processor.options.insertFn(
      { insertInto },
      uri,
      {},
      input,
      record.createdAt,
    )
    expect(result).toBeNull()
    expect(insertInto).not.toHaveBeenCalled()
  })

  it('accepts a delegation issued by its repository owner', async () => {
    makePlugin({} as never, {} as never)
    const query = {
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(record),
    }
    await processor.options.insertFn(
      { insertInto: () => query },
      uri,
      { toString: () => 'cid' },
      record,
      record.createdAt,
    )
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        creator: owner,
        delegator: owner,
        delegate: record.delegate,
      }),
    )
  })
})
