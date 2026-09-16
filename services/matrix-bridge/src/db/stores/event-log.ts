import type { BridgeEvent } from '../records.js'

export interface EventLogStore {
  appendEvent(event: {
    type: string
    communityUri: string | null
    audienceDids: string[] | null
    payload: unknown
  }): Promise<BridgeEvent>

  /** Events with seq > afterSeq, ordered by seq, capped at limit. */
  listEventsAfter(afterSeq: number, limit: number): Promise<BridgeEvent[]>

  /** Highest seq currently retained (0 when the log is empty). */
  getMaxEventSeq(): Promise<number>

  /** Delete events older than the given ISO timestamp; returns rows pruned. */
  pruneEventsBefore(cutoffIso: string): Promise<number>
}
