export interface MatrixEventsStore {
  insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean>

  getMatrixPollCursor(roomId: string): Promise<string | undefined>
  setMatrixPollCursor(roomId: string, cursor: string): Promise<void>

  eventExists(eventId: string): Promise<boolean>

  getRecentEvents(roomId: string, limit?: number): Promise<any[]>

  setReadMarker(did: string, roomId: string, eventId: string): Promise<void>

  getUnreadCount(did: string, roomId: string): Promise<number>

  getUnreadCountsForDid(
    did: string,
  ): Promise<
    { roomId: string; communityUri: string; slug: string; unread: number }[]
  >

  getTotalUnreadForDid(did: string): Promise<number>

  getAllRoomIds(): Promise<string[]>

  /** Appservice transaction dedup: true when freshly recorded. */
  recordAsTransaction(txnId: string): Promise<boolean>
}
