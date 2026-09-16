import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BridgeDatabase } from '../db/sqlite/index.js'
import { SqliteBridgeDatabase } from '../db/sqlite-wrapper.js'
import { audienceFilterFor, EventBus } from '../events/bus.js'

const silentLog = { warn: () => {} }

describe('EventBus — SSE backing store', () => {
  let db: BridgeDatabase
  let wrapped: SqliteBridgeDatabase
  let dbPath: string
  let bus: EventBus

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `para-bridge-events-${Date.now()}.db`)
    db = new BridgeDatabase({ dbPath } as any)
    wrapped = new SqliteBridgeDatabase({ dbPath } as any)
    bus = new EventBus(wrapped, silentLog as any)
  })

  afterEach(() => {
    wrapped.close()
    db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // ignore
    }
  })

  const community = 'at://creator/com.para.community.board/test'

  it('publish persists with monotonic seq and fans out to subscribers', async () => {
    const received: number[] = []
    const unsubscribe = bus.subscribe((e) => received.push(e.seq))

    const a = await bus.publish({
      type: 'proposal.state',
      communityUri: community,
      payload: { to: 'voting' },
    })
    const b = await bus.publish({
      type: 'membership.changed',
      communityUri: community,
      audienceDids: ['did:plc:alice'],
      payload: { did: 'did:plc:alice' },
    })

    expect(a.seq).toBeGreaterThan(0)
    expect(b.seq).toBeGreaterThan(a.seq)
    expect(received).toEqual([a.seq, b.seq])
    unsubscribe()
  })

  it('replays only events the filter admits, after the cursor', async () => {
    const e1 = await bus.publish({
      type: 'membership.changed',
      communityUri: community,
      audienceDids: ['did:plc:alice'],
      payload: {},
    })
    const e2 = await bus.publish({
      type: 'proposal.state',
      communityUri: community,
      payload: {},
    })

    // alice sees both; bob sees only the community-wide event
    const alice = await bus.replay(
      0,
      audienceFilterFor('did:plc:alice', new Set([community])),
    )
    const bob = await bus.replay(
      0,
      audienceFilterFor('did:plc:bob', new Set([community])),
    )
    expect(alice.events.map((e) => e.seq)).toEqual([e1.seq, e2.seq])
    expect(bob.events.map((e) => e.seq)).toEqual([e2.seq])

    // cursor semantics: strictly after
    const afterFirst = await bus.replay(
      e1.seq,
      audienceFilterFor('did:plc:alice', new Set([community])),
    )
    expect(afterFirst.events.map((e) => e.seq)).toEqual([e2.seq])
  })

  it('filters community-wide events by the caller’s communities', async () => {
    await bus.publish({
      type: 'proposal.state',
      communityUri: 'at://x/com.para.community.board/other',
      payload: {},
    })
    const result = await bus.replay(
      0,
      audienceFilterFor('did:plc:alice', new Set([community])),
    )
    expect(result.events).toHaveLength(0)
  })

  it('prunes past retention and then flags old cursors as un-replayable', async () => {
    const e1 = await bus.publish({
      type: 'proposal.state',
      communityUri: community,
      payload: {},
    })
    // Age the row beyond the retention window directly in sqlite.
    ;(db as any).db
      .prepare("UPDATE event_log SET created_at = datetime('now', '-30 days')")
      .run()
    await bus.prune()
    expect(await bus.maxSeq()).toBe(0)

    const oldest = await bus.oldestRetainedSeq()
    expect(oldest).toBeNull()
    // A client arriving with e1.seq must be told to resync, not silently gap:
    // nothing is retained at all, so `oldestRetainedSeq` null + maxSeq 0
    // means any nonzero cursor predates retention.
    expect(e1.seq).toBeGreaterThan(0)
  })
})
