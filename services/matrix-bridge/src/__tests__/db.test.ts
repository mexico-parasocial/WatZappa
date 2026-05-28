import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BridgeDatabase } from '../db.js'

describe('BridgeDatabase — sortition proofs', () => {
  let db: BridgeDatabase
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `para-bridge-test-${Date.now()}.db`)
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

  it('saves and retrieves a sortition proof', () => {
    db.saveSortitionProof({
      did: 'did:plc:abc123',
      communityUri: 'at://creator/com.para.community.board/test',
      chamber: 'A',
      drandRound: 4567890,
      drandRandomness: 'a3f2b1...',
      hashInput: 'deadbeef...',
      hashOutput: 'cafebabe...',
      threshold: 0.47,
      timestamp: '2026-05-05T14:00:00Z',
    })

    const proof = db.getSortitionProof(
      'did:plc:abc123',
      'at://creator/com.para.community.board/test',
    )

    expect(proof).toBeDefined()
    expect(proof.did).toBe('did:plc:abc123')
    expect(proof.community_uri).toBe(
      'at://creator/com.para.community.board/test',
    )
    expect(proof.chamber).toBe('A')
    expect(proof.drand_round).toBe(4567890)
    expect(proof.verified).toBe(1)
  })

  it('overwrites existing proof for same did+community', () => {
    db.saveSortitionProof({
      did: 'did:plc:abc123',
      communityUri: 'at://creator/com.para.community.board/test',
      chamber: 'A',
      drandRound: 1,
      drandRandomness: 'old',
      hashInput: 'old',
      hashOutput: 'old',
      threshold: 0.5,
      timestamp: '2026-01-01T00:00:00Z',
    })

    db.saveSortitionProof({
      did: 'did:plc:abc123',
      communityUri: 'at://creator/com.para.community.board/test',
      chamber: 'B',
      drandRound: 2,
      drandRandomness: 'new',
      hashInput: 'new',
      hashOutput: 'new',
      threshold: 0.6,
      timestamp: '2026-05-05T14:00:00Z',
    })

    const proof = db.getSortitionProof(
      'did:plc:abc123',
      'at://creator/com.para.community.board/test',
    )

    expect(proof.chamber).toBe('B')
    expect(proof.drand_round).toBe(2)
  })

  it('returns proofs by community', () => {
    db.saveSortitionProof({
      did: 'did:plc:alice',
      communityUri: 'at://creator/com.para.community.board/city1',
      chamber: 'A',
      drandRound: 1,
      drandRandomness: 'r1',
      hashInput: 'i1',
      hashOutput: 'o1',
      threshold: 0.5,
      timestamp: '2026-05-05T14:00:00Z',
    })

    db.saveSortitionProof({
      did: 'did:plc:bob',
      communityUri: 'at://creator/com.para.community.board/city1',
      chamber: 'B',
      drandRound: 2,
      drandRandomness: 'r2',
      hashInput: 'i2',
      hashOutput: 'o2',
      threshold: 0.5,
      timestamp: '2026-05-05T14:01:00Z',
    })

    db.saveSortitionProof({
      did: 'did:plc:charlie',
      communityUri: 'at://creator/com.para.community.board/city2',
      chamber: 'A',
      drandRound: 3,
      drandRandomness: 'r3',
      hashInput: 'i3',
      hashOutput: 'o3',
      threshold: 0.5,
      timestamp: '2026-05-05T14:02:00Z',
    })

    const city1Proofs = db.getSortitionProofsByCommunity(
      'at://creator/com.para.community.board/city1',
    )
    expect(city1Proofs).toHaveLength(2)

    const city2Proofs = db.getSortitionProofsByCommunity(
      'at://creator/com.para.community.board/city2',
    )
    expect(city2Proofs).toHaveLength(1)
  })

  it('counts proofs', () => {
    expect(db.getSortitionProofCount()).toBe(0)

    db.saveSortitionProof({
      did: 'did:plc:alice',
      communityUri: 'at://creator/com.para.community.board/city1',
      chamber: 'A',
      drandRound: 1,
      drandRandomness: 'r1',
      hashInput: 'i1',
      hashOutput: 'o1',
      threshold: 0.5,
      timestamp: '2026-05-05T14:00:00Z',
    })

    expect(db.getSortitionProofCount()).toBe(1)
  })
})

describe('BridgeDatabase — community Matrix rooms', () => {
  let db: BridgeDatabase
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `para-bridge-test-${Date.now()}.db`)
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
        unread: 0,
      },
    ])

    db.setCommunityMembership(did, communityUri, 'left', [])
    expect(db.isActiveCommunityMember(did, communityUri)).toBe(false)
    expect(db.getUnreadCountsForDid(did)).toEqual([])
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
