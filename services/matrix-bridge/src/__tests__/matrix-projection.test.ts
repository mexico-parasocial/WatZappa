import type { Logger } from 'pino'
import { describe, expect, it } from 'vitest'
import type { IBridgeDatabase } from '../db/index.js'
import type { DeviceSession } from '../db/interface.js'
import { createMatrixProjection } from '../matrix-projection.js'
import type { MatrixAdminClient } from '../matrix.js'
import { deriveIdentity } from './helpers/identity.js'

const log = { info() {}, warn() {}, debug() {} } as unknown as Logger
const config = { matrixServerName: 'matrix.example' } as never

const space = {
  communityUri: 'at://did:plc:creator/com.para.community.board/one',
  spaceId: '!main:para',
  slug: 'one',
  chamberMode: 'bicameral',
  chamberA_RoomId: '!a:para',
  chamberB_RoomId: '!b:para',
  observerRoomId: '!obs:para',
  createdAt: '2026-01-01T00:00:00Z',
} as const

const spaceByUri: Record<string, typeof space> = {}

function makeStubDeps() {
  const calls: Array<{ op: string; args: any[] }> = []
  const sessions: DeviceSession[] = []
  const revoked: string[] = []
  const memberships: Array<{
    communityUri: string
    state: string
    roles: string[]
  }> = []
  const chamberByUri: Record<string, 'A' | 'B' | undefined> = {}
  const matrix = {
    userExists: async () => false,
    createUser: async (mxid: string) => {
      calls.push({ op: 'createUser', args: [mxid] })
    },
    joinUser: async (roomId: string, mxid: string) => {
      calls.push({ op: 'join', args: [roomId, mxid] })
      return roomId
    },
    setPowerLevel: async (roomId: string, mxid: string, level: number) => {
      calls.push({ op: 'power', args: [roomId, mxid, level] })
    },
    banUser: async (roomId: string, mxid: string) => {
      calls.push({ op: 'ban', args: [roomId, mxid] })
    },
    adminDeactivateDevice: async (mxid: string, deviceId: string) => {
      calls.push({ op: 'deactivate', args: [mxid, deviceId] })
    },
  } as unknown as MatrixAdminClient
  const leases: Array<{ communityUri: string; mxid: string }> = []
  const db = {
    listDeviceSessions: async () => sessions,
    revokeDeviceSession: async (_did: string, id: string) => {
      revoked.push(id)
      return true
    },
    getMembershipsForDid: async () => memberships,
    getSpaceForCommunity: async (uri: string) => spaceByUri[uri],
    getChamberAssignment: async (uri: string) => chamberByUri[uri],
    upsertCommunityMembershipLease: async (
      communityUri: string,
      mxid: string,
    ) => {
      leases.push({ communityUri, mxid })
    },
  } as unknown as IBridgeDatabase
  return {
    calls,
    sessions,
    revoked,
    memberships,
    chamberByUri,
    leases,
    matrix,
    db,
  }
}

function session(
  did: string,
  mxid: string,
  id: string,
  revokedAt: string | null = null,
): DeviceSession {
  return {
    id,
    did,
    mxid,
    deviceId: `DEV-${id}`,
    friendlyName: null,
    userAgent: null,
    createdAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    revokedAt,
  }
}

const identity = deriveIdentity(new Uint8Array(32), 'public')
const expectedMxid = '@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.example'

describe('verifiedJoin (CD-M6)', () => {
  it('derives the MXID from the presented key, provisions and joins', async () => {
    const { calls, matrix, db } = makeStubDeps()
    const projection = createMatrixProjection(config, db, matrix, log)
    const result = await projection.verifiedJoin(
      space,
      'did:plc:member',
      identity.pub,
      {
        roles: ['moderator'],
        chamber: 'A',
        isObserver: false,
      },
    )
    expect(result.mxid).toBe(expectedMxid)
    expect(result.joinedRoomIds).toEqual(['!main:para', '!a:para'])
    // The user record is created from the derived MXID only — no DID, no
    // display name, nothing reversible.
    expect(calls[0]).toEqual({ op: 'createUser', args: [expectedMxid] })
    expect(
      calls.some((c) => c.op === 'join' && c.args[1] === expectedMxid),
    ).toBe(true)
    // Moderator power level in main space and chamber.
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!main:para', expectedMxid, 50],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!a:para', expectedMxid, 50],
    })
  })

  it('places observers in both chambers read-only plus the observer room', async () => {
    const { calls, matrix, db } = makeStubDeps()
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.verifiedJoin(space, 'did:plc:observer', identity.pub, {
      roles: ['observer'],
      chamber: null,
      isObserver: true,
    })
    expect(calls).toContainEqual({
      op: 'join',
      args: ['!a:para', expectedMxid],
    })
    expect(calls).toContainEqual({
      op: 'join',
      args: ['!b:para', expectedMxid],
    })
    expect(calls).toContainEqual({
      op: 'join',
      args: ['!obs:para', expectedMxid],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!a:para', expectedMxid, -1],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!b:para', expectedMxid, -1],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!main:para', expectedMxid, 0],
    })
  })

  it('never receives or records a DID anywhere in the Matrix calls', async () => {
    const { calls, matrix, db } = makeStubDeps()
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.verifiedJoin(space, 'did:plc:secret', identity.pub, {
      roles: [],
      chamber: 'B',
      isObserver: false,
    })
    const wire = JSON.stringify(calls)
    expect(wire).not.toContain('did:plc:secret')
  })
})

describe('applyMemberRoles (handover)', () => {
  it('projects new power levels onto minted sessions only', async () => {
    const { calls, sessions, matrix, db } = makeStubDeps()
    sessions.push(session('did:plc:m', expectedMxid, 's1'))
    sessions.push(session('did:plc:m', expectedMxid, 's2')) // second device, same mxid
    sessions.push(
      session(
        'did:plc:m',
        '@other:matrix.example',
        's3',
        '2026-01-02T00:00:00Z',
      ),
    ) // revoked → excluded
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.applyMemberRoles(space, 'did:plc:m', {
      roles: ['owner'],
      chamber: 'B',
      isObserver: false,
    })
    // Owner promotion reaches main + the assigned chamber, not the other chamber.
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!main:para', expectedMxid, 100],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!b:para', expectedMxid, 100],
    })
    expect(calls.some((c) => c.op === 'power' && c.args[0] === '!a:para')).toBe(
      false,
    )
    expect(
      calls.some(
        (c) => c.op === 'power' && c.args[1] === '@other:matrix.example',
      ),
    ).toBe(false)
  })

  it('is a no-op for a member with no minted sessions (not yet joined)', async () => {
    const { calls, matrix, db } = makeStubDeps()
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.applyMemberRoles(space, 'did:plc:nobody', {
      roles: ['moderator'],
      chamber: 'A',
      isObserver: false,
    })
    expect(calls).toEqual([])
  })

  it('demotes to observer across both chambers', async () => {
    const { calls, sessions, matrix, db } = makeStubDeps()
    sessions.push(session('did:plc:m', expectedMxid, 's1'))
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.applyMemberRoles(space, 'did:plc:m', {
      roles: ['observer'],
      chamber: null,
      isObserver: true,
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!a:para', expectedMxid, -1],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!b:para', expectedMxid, -1],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!main:para', expectedMxid, 0],
    })
  })
})

describe('membership lease refresh (CD-M6 residual fix)', () => {
  it('a verified join starts a lease for the joined account', async () => {
    const { leases, matrix, db } = makeStubDeps()
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.verifiedJoin(space, 'did:plc:member', identity.pub, {
      roles: [],
      chamber: 'A',
      isObserver: false,
    })
    expect(leases).toEqual([
      { communityUri: space.communityUri, mxid: expectedMxid },
    ])
  })

  it('reconciliation renews leases for active communities, never for removed ones', async () => {
    const { calls, sessions, memberships, leases, matrix, db } = makeStubDeps()
    spaceByUri[space.communityUri] = space
    sessions.push(session('did:plc:m', '@anon:matrix.example', 's1'))
    memberships.push(
      { communityUri: space.communityUri, state: 'active', roles: [] },
      {
        communityUri: 'at://gone/com.para.community.board/x',
        state: 'removed',
        roles: [],
      },
    )
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.reconcileMemberAccess('did:plc:m', expectedMxid)
    const renewed = leases.map((l) => `${l.communityUri}|${l.mxid}`).sort()
    expect(renewed).toEqual(
      [
        `${space.communityUri}|${expectedMxid}`,
        `${space.communityUri}|@anon:matrix.example`,
      ].sort(),
    )
    // And the presented account was banned from the removed community
    // (no space provisioned there — nothing to ban from in this fixture).
    expect(calls.some((c) => c.op === 'ban')).toBe(false)
  })
})

describe('reconcileMemberAccess (interaction-time settlement)', () => {
  const presented = '@presented:matrix.example'

  it('catches up role changes that arrived while the member was offline', async () => {
    const { calls, sessions, memberships, chamberByUri, matrix, db } =
      makeStubDeps()
    spaceByUri[space.communityUri] = space
    chamberByUri[space.communityUri] = 'B'
    memberships.push({
      communityUri: space.communityUri,
      state: 'active',
      roles: ['moderator'],
    })
    // The member has a minted session under a different (anonymous) identity;
    // the presented one must be included in the projection.
    sessions.push(session('did:plc:m', '@anon:matrix.example', 's1'))
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.reconcileMemberAccess('did:plc:m', presented)
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!main:para', presented, 50],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!b:para', presented, 50],
    })
    expect(calls).toContainEqual({
      op: 'power',
      args: ['!main:para', '@anon:matrix.example', 50],
    })
  })

  it('bans the presented account from communities the DID was removed from, MAS-native or not', async () => {
    const { calls, memberships, matrix, db } = makeStubDeps()
    spaceByUri[space.communityUri] = space
    memberships.push({
      communityUri: space.communityUri,
      state: 'removed',
      roles: [],
    })
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.reconcileMemberAccess('did:plc:gone', presented)
    // No minted sessions exist — the ban of the presented account is the
    // entire enforcement, and it must happen in every room.
    for (const roomId of ['!main:para', '!a:para', '!b:para', '!obs:para']) {
      expect(calls).toContainEqual({ op: 'ban', args: [roomId, presented] })
    }
    expect(calls.some((c) => c.op === 'deactivate')).toBe(false)
  })

  it('leaves communities with no provisioned space alone', async () => {
    const { calls, memberships, matrix, db } = makeStubDeps()
    memberships.push({
      communityUri: 'at://other/com.para.community.board/x',
      state: 'removed',
      roles: [],
    })
    const projection = createMatrixProjection(config, db, matrix, log)
    await projection.reconcileMemberAccess('did:plc:m', presented)
    expect(calls).toEqual([])
  })
})

describe('revokeMemberAccess', () => {
  it('deactivates devices and bans the mxids from every community room', async () => {
    const { calls, sessions, revoked, matrix, db } = makeStubDeps()
    sessions.push(session('did:plc:gone', expectedMxid, 's1'))
    const projection = createMatrixProjection(config, db, matrix, log)
    const count = await projection.revokeMemberAccess(
      space,
      'did:plc:gone',
      'removed',
    )
    expect(count).toBe(1)
    expect(calls).toContainEqual({
      op: 'deactivate',
      args: [expectedMxid, 'DEV-s1'],
    })
    for (const roomId of ['!main:para', '!a:para', '!b:para', '!obs:para']) {
      expect(calls).toContainEqual({ op: 'ban', args: [roomId, expectedMxid] })
    }
    expect(revoked).toEqual(['s1'])
  })

  it('returns zero for a DID with no sessions and touches nothing', async () => {
    const { calls, matrix, db } = makeStubDeps()
    const projection = createMatrixProjection(config, db, matrix, log)
    expect(
      await projection.revokeMemberAccess(space, 'did:plc:none', 'left'),
    ).toBe(0)
    expect(calls).toEqual([])
  })
})
