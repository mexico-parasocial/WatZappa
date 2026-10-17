import type { DmRequest, DmRequestSummary } from '../records.js'

export interface DmRequestsStore {
  /**
   * Create the pending request from requester to recipient, or refresh the
   * MXID on the pending one that already exists for that pair. Expired and
   * accepted requests for the pair are dropped first, so asking again after
   * an acceptance is a new request with a new id.
   */
  upsertDmRequest(
    request: DmRequest,
    now: string,
  ): Promise<{ id: string; expiresAt: string; created: boolean }>

  /** Live pending requests the DID has sent. */
  countPendingDmRequestsFrom(requesterDid: string, now: string): Promise<number>

  /**
   * Live requests: incoming = pending ones addressed to the DID; outgoing =
   * the DID's own, pending or accepted. Never includes MXIDs.
   */
  listDmRequests(
    did: string,
    now: string,
  ): Promise<{ incoming: DmRequestSummary[]; outgoing: DmRequestSummary[] }>

  /**
   * Accept: atomically mark a live pending request addressed to the recipient
   * as accepted, blank its MXID, and return who asked and the MXID as it was.
   * Undefined when there is no such live pending request.
   */
  takeDmRequest(
    id: string,
    recipientDid: string,
    now: string,
  ): Promise<{ requesterDid: string; requesterMxid: string } | undefined>

  /** Decline (recipient) or cancel (requester). True when a row went away. */
  deleteDmRequest(id: string, did: string): Promise<boolean>

  /** Drop expired requests; returns how many. */
  purgeExpiredDmRequests(now: string): Promise<number>
}
