import { EventEmitter } from 'node:events'
import type { BridgeEvent } from '../db/records.js'
import type { IBridgeDatabase } from '../db/index.js'

/**
 * In-process event bus backing GET /api/events (SSE).
 *
 * Delivery contract (per the MATRIX_V2 review):
 * - at-least-once: clients dedup on `seq`
 * - replay within a retention window only; older cursors get a
 *   `resync_required` control event instead of a silent gap
 * - audiences are per-resource: explicit DID lists for individual events,
 *   community-wide only for events every member may see
 * - permissions are re-checked at subscribe time AND during replay, so a
 *   revoked member cannot replay events they were entitled to before
 *
 * The bus is deliberately single-process (vertical scaling decision):
 * EventEmitter fan-out plus the shared event_log table.
 */

export const EVENT_TYPES = [
  'membership.changed',
  'proposal.state',
  'sortition.selected',
  'sortition.run.updated',
  'chat.unread',
  'badge.updated',
  'constitution.updated',
  'resync_required',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_RETENTION_DAYS = 7
export const REPLAY_BATCH = 200

export class EventBus {
  private emitter = new EventEmitter()
  private pruning: Promise<void> | undefined

  constructor(
    private db: IBridgeDatabase,
    private log: { warn: (obj: unknown, msg: string) => void },
  ) {
    this.emitter.setMaxListeners(0) // one listener per SSE connection
  }

  /** Publish: persists first, then fans out. */
  async publish(input: {
    type: EventType
    communityUri: string | null
    audienceDids?: string[] | null
    payload: unknown
  }): Promise<BridgeEvent> {
    const event = await this.db.appendEvent({
      type: input.type,
      communityUri: input.communityUri,
      audienceDids: input.audienceDids ?? null,
      payload: input.payload,
    })
    this.emitter.emit('event', event)
    return event
  }

  /**
   * Replay retained events a caller is entitled to, strictly after
   * `lastSeq`, newest-last. Authorization is the caller's filter fn —
   * re-evaluated per event so replay respects current permissions.
   */
  async replay(
    lastSeq: number,
    mayReceive: (event: BridgeEvent) => boolean,
  ): Promise<{ events: BridgeEvent[]; resyncRequired: boolean }> {
    const events = (
      await this.db.listEventsAfter(lastSeq, REPLAY_BATCH)
    ).filter(mayReceive)
    return { events, resyncRequired: false }
  }

  /** Subscribe to live events; returns an unsubscribe fn. */
  subscribe(listener: (event: BridgeEvent) => void): () => void {
    this.emitter.on('event', listener)
    return () => this.emitter.off('event', listener)
  }

  /** Oldest retained seq — cursors older than this cannot be replayed. */
  async oldestRetainedSeq(): Promise<number | null> {
    const all = await this.db.listEventsAfter(0, 1)
    return all.length ? all[0].seq : null
  }

  maxSeq(): Promise<number> {
    return this.db.getMaxEventSeq()
  }

  /** Retention pruning, idempotent per invocation. */
  prune(): Promise<void> {
    this.pruning ??= (async () => {
      try {
        const cutoff = new Date(
          Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
        const pruned = await this.db.pruneEventsBefore(cutoff)
        if (pruned > 0) {
          this.log.warn({ pruned }, 'pruned SSE event_log rows past retention')
        }
      } finally {
        this.pruning = undefined
      }
    })()
    return this.pruning
  }
}

/**
 * Audience filter for a connected DID: explicit audience lists must include
 * the DID; community-wide events pass (the route layer filters by the
 * caller's communities).
 */
export function audienceFilterFor(
  did: string,
  callerCommunities: Set<string>,
): (event: BridgeEvent) => boolean {
  return (event) => {
    if (event.audienceDids) return event.audienceDids.includes(did)
    if (event.communityUri) return callerCommunities.has(event.communityUri)
    // Global events (no community, no audience) are bridge-wide notices.
    return true
  }
}
