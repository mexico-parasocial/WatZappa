export interface MatrixEventsStore {

  insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean>

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
}
