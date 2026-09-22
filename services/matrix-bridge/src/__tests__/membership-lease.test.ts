import { describe, expect, it } from 'vitest'
import type { Logger } from 'pino'
import type { IBridgeDatabase } from '../db/index.js'
import { sweepExpiredMembershipLeases } from '../membership-lease.js'
import type { MatrixAdminClient } from '../matrix.js'

const log = { info() {}, warn() {}, debug() {} } as unknown as Logger

const DAY = 24 * 3600 * 1000

describe('sweepExpiredMembershipLeases (CD-M6 residual fix)', () => {
  function makeDeps() {
    const kicks: Array<{ roomId: string; mxid: string; reason: string }> = []
    const matrix = {
      kickUser: async (roomId: string, mxid: string, reason: string) => {
        kicks.push({ roomId, mxid, reason })
      },
    } as unknown as MatrixAdminClient
    const leases = new Map<
      string,
      { communityUri: string; mxid: string; lastVerifiedAt: string }
    >()
    const spaces = new Map<
      string,
      {
        spaceId: string
        chamberA_RoomId: string | null
        chamberB_RoomId: string | null
        observerRoomId: string | null
      }
    >()
    const db = {
      getExpiredCommunityMembershipLeases: async (cutoff: string) =>
        [...leases.values()].filter((l) => l.lastVerifiedAt < cutoff),
      deleteCommunityMembershipLease: async (
        communityUri: string,
        mxid: string,
      ) => {
        leases.delete(`${communityUri}|${mxid}`)
      },
      getSpaceForCommunity: async (uri: string) => spaces.get(uri),
    } as unknown as IBridgeDatabase
    return { kicks, leases, spaces, matrix, db }
  }

  const community = 'at://c/com.para.community.board/one'

  it('kicks expired accounts from every room of the community and drops the lease', async () => {
    const { kicks, leases, spaces, matrix, db } = makeDeps()
    spaces.set(community, {
      spaceId: '!main:para',
      chamberA_RoomId: '!a:para',
      chamberB_RoomId: '!b:para',
      observerRoomId: '!obs:para',
    })
    leases.set(`${community}|@gone:para`, {
      communityUri: community,
      mxid: '@gone:para',
      lastVerifiedAt: new Date(Date.now() - 40 * DAY).toISOString(),
    })
    leases.set(`${community}|@fresh:para`, {
      communityUri: community,
      mxid: '@fresh:para',
      lastVerifiedAt: new Date().toISOString(),
    })
    const evicted = await sweepExpiredMembershipLeases(
      db,
      matrix,
      log,
      30 * DAY,
    )
    expect(evicted).toBe(1)
    expect(kicks).toHaveLength(4)
    expect(new Set(kicks.map((k) => k.roomId))).toEqual(
      new Set(['!main:para', '!a:para', '!b:para', '!obs:para']),
    )
    expect(kicks.every((k) => k.mxid === '@gone:para')).toBe(true)
    // Only the expired lease was removed; the fresh one survives.
    expect([...leases.keys()]).toEqual([`${community}|@fresh:para`])
  })

  it('survives kick failures (account not in a room) and still drops the lease', async () => {
    const { kicks, leases, spaces, matrix, db } = makeDeps()
    spaces.set(community, {
      spaceId: '!main:para',
      chamberA_RoomId: null,
      chamberB_RoomId: null,
      observerRoomId: null,
    })
    ;(matrix as any).kickUser = async () => {
      throw new Error('not in room')
    }
    leases.set(`${community}|@gone:para`, {
      communityUri: community,
      mxid: '@gone:para',
      lastVerifiedAt: new Date(Date.now() - 40 * DAY).toISOString(),
    })
    const evicted = await sweepExpiredMembershipLeases(
      db,
      matrix,
      log,
      30 * DAY,
    )
    expect(evicted).toBe(1)
    expect(kicks).toHaveLength(0)
    expect(leases.size).toBe(0)
  })

  it('does nothing when disabled (ttl 0) and skips communities with no space', async () => {
    const { kicks, leases, matrix, db } = makeDeps()
    leases.set(`${community}|@gone:para`, {
      communityUri: community,
      mxid: '@gone:para',
      lastVerifiedAt: new Date(0).toISOString(),
    })
    expect(await sweepExpiredMembershipLeases(db, matrix, log, 0)).toBe(0)
    expect(kicks).toHaveLength(0)
    // No space provisioned: the lease is dropped without any kicks.
    expect(await sweepExpiredMembershipLeases(db, matrix, log, 30 * DAY)).toBe(
      1,
    )
    expect(kicks).toHaveLength(0)
    expect(leases.size).toBe(0)
  })
})
