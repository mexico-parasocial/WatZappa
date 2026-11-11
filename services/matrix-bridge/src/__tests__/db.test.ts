import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BridgeDatabase } from '../db/sqlite/index.js'

describe('BridgeDatabase — community Matrix rooms', () => {
  let db: BridgeDatabase
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `para-bridge-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    db = new BridgeDatabase({ dbPath } as any)
  })

  afterEach(() => {
    db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // cleanup may fail if file didn't exist
    }
  })

  it('maps SQLite community-space rows to the shape used by sync code', () => {
    const communityUri = 'at://creator/com.para.community.board/test'
    db.setSpaceForCommunity(
      communityUri,
      '!space:matrix.test',
      'test',
      'bicameral',
    )
    db.setChamberRooms(
      communityUri,
      '!a:matrix.test',
      '!b:matrix.test',
      '!observer:matrix.test',
    )

    const space = db.getSpaceForCommunity(communityUri)

    expect(space).toMatchObject({
      communityUri,
      spaceId: '!space:matrix.test',
      slug: 'test',
      chamberMode: 'bicameral',
      chamberA_RoomId: '!a:matrix.test',
      chamberB_RoomId: '!b:matrix.test',
      observerRoomId: '!observer:matrix.test',
    })
  })

  it('resolves communities and polling rooms from spaces and chamber rooms', () => {
    const communityUri = 'at://creator/com.para.community.board/test'
    db.setSpaceForCommunity(
      communityUri,
      '!space:matrix.test',
      'test',
      'bicameral',
    )
    db.setChamberRooms(
      communityUri,
      '!a:matrix.test',
      '!b:matrix.test',
      '!observer:matrix.test',
    )

    expect(db.getCommunityByRoomId('!space:matrix.test')).toEqual({
      communityUri,
      slug: 'test',
    })
    expect(db.getCommunityByRoomId('!a:matrix.test')).toEqual({
      communityUri,
      slug: 'test',
    })
    expect(db.getAllRoomIds().sort()).toEqual([
      '!a:matrix.test',
      '!b:matrix.test',
      '!observer:matrix.test',
      '!space:matrix.test',
    ])
  })

  it('counts active members for unicameral quorum', () => {
    const communityUri = 'at://creator/com.para.community.board/test'
    db.setSpaceForCommunity(communityUri, '!space:matrix.test', 'test')

    expect(db.getActiveMemberCount(communityUri)).toBe(0)

    db.setCommunityMembership('did:plc:active1', communityUri, 'active', [
      'member',
    ])
    db.setCommunityMembership('did:plc:active2', communityUri, 'active', [
      'member',
    ])
    db.setCommunityMembership('did:plc:left', communityUri, 'left', [])

    expect(db.getActiveMemberCount(communityUri)).toBe(2)
  })

  it('tracks active community membership for auth gates', () => {
    const communityUri = 'at://creator/com.para.community.board/test'
    const did = 'did:plc:member'
    db.setSpaceForCommunity(communityUri, '!space:matrix.test', 'test')

    expect(db.isActiveCommunityMember(did, communityUri)).toBe(false)

    db.setCommunityMembership(did, communityUri, 'active', ['member'])
    expect(db.isActiveCommunityMember(did, communityUri)).toBe(true)
    expect(db.getUnreadCountsForDid(did)).toEqual([
      {
        roomId: '!space:matrix.test',
        communityUri,
        slug: 'test',
        kind: 'main',
        unread: 0,
      },
    ])

    db.setCommunityMembership(did, communityUri, 'left', [])
    expect(db.isActiveCommunityMember(did, communityUri)).toBe(false)
    expect(db.getUnreadCountsForDid(did)).toEqual([])
  })

  it('keeps unassigned members out of chamber rooms', () => {
    const communityUri = 'at://creator/com.para.community.board/bicameral'
    const did = 'did:plc:member'
    db.setSpaceForCommunity(
      communityUri,
      '!space:matrix.test',
      'bicameral',
      'bicameral',
    )
    db.setChamberRooms(
      communityUri,
      '!a:matrix.test',
      '!b:matrix.test',
      '!observer:matrix.test',
    )
    db.setCommunityMembership(did, communityUri, 'active', ['member'])

    expect(db.getUnreadCountsForDid(did)).toEqual([
      {
        roomId: '!space:matrix.test',
        communityUri,
        slug: 'bicameral',
        kind: 'main',
        unread: 0,
      },
    ])
  })

  it('stores Matrix event metadata without raw content', () => {
    const inserted = db.insertMatrixEvent({
      roomId: '!space:matrix.test',
      eventId: '$event',
      sender: '@alice:matrix.test',
      type: 'm.room.encrypted',
      content: null,
      originServerTs: Date.now(),
    })

    expect(inserted).toBe(true)
    const [event] = db.getRecentEvents('!space:matrix.test', 1)
    expect(event.event_id).toBe('$event')
    expect(event.content).toBeNull()
  })
})
