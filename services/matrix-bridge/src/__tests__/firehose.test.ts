import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatModerationEngine } from '../chat-moderation.js'
import type { TrustedMembership } from '../community-authority.js'
import type { Config } from '../config.js'
import { SqliteBridgeDatabase } from '../db/index.js'
import {
  FirehoseConsumer,
  prepareFirehoseCursor,
  signalToChoice,
} from '../firehose.js'
import type { MatrixProjectionPort } from '../matrix-projection.js'
import { BridgeMetrics } from '../metrics.js'
import type { ProposalEngine } from '../proposals.js'

describe(signalToChoice, () => {
  for (const { signal, expected } of [
    { signal: 3, expected: 'for' },
    { signal: 2, expected: 'for' },
    { signal: 1, expected: 'for' },
    { signal: 0, expected: 'abstain' },
    { signal: -1, expected: 'against' },
    { signal: -2, expected: 'against' },
    { signal: -3, expected: 'against' },
  ]) {
    it(`maps signal ${signal} to ${expected}`, () => {
      expect(signalToChoice(signal)).toBe(expected)
    })
  }

  it('returns null for out-of-range signals', () => {
    expect(signalToChoice(Number.NaN)).toBeNull()
  })
})

describe(prepareFirehoseCursor, () => {
  it('binds an empty database to the requested PDS source', async () => {
    let source: string | undefined
    const db = {
      getSyncCursor: async () => undefined,
      getSyncSource: async () => source,
      setSyncSource: async (value: string) => {
        source = value
      },
    }
    expect(await prepareFirehoseCursor(db, 'pds-one')).toBeUndefined()
    expect(source).toBe('pds-one')
  })

  it('refuses a cursor from another source without changing it', async () => {
    let source = 'pds-one'
    const db = {
      getSyncCursor: async () => 1169,
      getSyncSource: async () => source,
      setSyncSource: async (value: string) => {
        source = value
      },
    }
    await expect(prepareFirehoseCursor(db, 'pds-two')).rejects.toThrow(
      'belongs to PDS source',
    )
    expect(source).toBe('pds-one')
    expect(await db.getSyncCursor()).toBe(1169)
  })

  it('refuses a legacy cursor with no known source', async () => {
    const db = {
      getSyncCursor: async () => 1169,
      getSyncSource: async () => undefined,
      setSyncSource: async () => {
        throw new Error('must not claim source')
      },
    }
    await expect(prepareFirehoseCursor(db, 'pds-two')).rejects.toThrow(
      'cursor without a PDS source',
    )
  })
})

describe('firehose trusted role projection', () => {
  const community = 'at://did:plc:owner/com.para.community.board/one'
  const member = 'did:plc:member'
  let db: SqliteBridgeDatabase
  let consumer: FirehoseConsumer
  let verified: TrustedMembership
  let unavailable: boolean
  const apply = vi.fn<MatrixProjectionPort['applyMemberRoles']>(async () => {})
  const revoke = vi.fn<MatrixProjectionPort['revokeMemberAccess']>(
    async () => 0,
  )

  beforeEach(async () => {
    apply.mockClear()
    revoke.mockClear()
    verified = { state: 'active', roles: ['member'] }
    unavailable = false
    const config = {
      dbPath: ':memory:',
      pdsFirehoseUrl: 'http://127.0.0.1:2583',
      backfillFromStart: false,
    } as Config
    db = new SqliteBridgeDatabase(config)
    await db.setSpaceForCommunity(community, '!space:test', 'one', 'unicameral')
    const log = pino({ level: 'silent' })
    consumer = new FirehoseConsumer(
      config,
      db,
      {
        applyMemberRoles: apply,
        revokeMemberAccess: revoke,
      } as unknown as MatrixProjectionPort,
      {} as ProposalEngine,
      new ChatModerationEngine(db, log),
      new BridgeMetrics(),
      log,
      async () => {
        if (unavailable) throw new Error('AppView down')
        return verified
      },
    )
  })
  afterEach(async () => {
    await db.close()
  })
  const ingest = async (
    record: Record<string, unknown>,
    did = member,
    collection = 'com.para.community.membership',
    event = 'update',
  ) => {
    await (
      consumer as unknown as { handleCommit(evt: unknown): Promise<void> }
    ).handleCommit({ collection, did, event, record })
  }

  it.each(['owner', 'moderator', 'delegate', 'observer'])(
    'ignores self-declared %s on create and update',
    async (role) => {
      await ingest(
        { community, membershipState: 'active', roles: [role] },
        member,
        'com.para.community.membership',
        'create',
      )
      await ingest({
        community,
        membershipState: 'active',
        roles: [role, 'owner'],
      })
      expect(await db.getCommunityMembership(member, community)).toEqual(
        verified,
      )
      expect(apply.mock.calls[0][2]).toMatchObject({
        roles: ['member'],
        isObserver: false,
      })
      expect(
        (await db.getParticipationStats(member, community)).is_moderator,
      ).toBe(0)
      expect(
        (await db.getParticipationStats(member, community)).is_delegate,
      ).toBe(0)
    },
  )
  it('does not infer owner authority from the board creator DID', async () => {
    await ingest(
      { community, membershipState: 'active', roles: ['owner'] },
      'did:plc:owner',
    )
    expect(
      (await db.getCommunityMembership('did:plc:owner', community))?.roles,
    ).toEqual(['member'])
  })
  it('projects a verified moderator and then revokes the grant without a membership rewrite', async () => {
    verified = { state: 'active', roles: ['member', 'moderator'] }
    await ingest(
      { community, subject: member, action: 'moderator.grant' },
      'did:plc:owner',
      'com.para.community.authorityEvent',
    )
    expect(apply.mock.calls.at(-1)?.[2].roles).toContain('moderator')
    expect(
      (await db.getParticipationStats(member, community)).is_moderator,
    ).toBe(1)
    verified = { state: 'active', roles: ['member'] }
    await ingest(
      { community, subject: member, action: 'moderator.revoke' },
      'did:plc:owner',
      'com.para.community.authorityEvent',
    )
    expect(apply.mock.calls.at(-1)?.[2].roles).toEqual(['member'])
    expect(
      (await db.getParticipationStats(member, community)).is_moderator,
    ).toBe(0)
  })
  it('removes access despite an active self-authored membership record', async () => {
    verified = { state: 'removed', roles: [] }
    await ingest({ community, membershipState: 'active', roles: ['owner'] })
    expect((await db.getCommunityMembership(member, community))?.state).toBe(
      'removed',
    )
    expect(revoke).toHaveBeenCalledWith(expect.anything(), member, 'removed')
  })
  it('repairs persisted forged grants before serving and catches expiration/indexing lag', async () => {
    await db.setCommunityMembership(member, community, 'active', [
      'owner',
      'observer',
    ])
    await consumer.reconcileAuthorities(true)
    expect((await db.getCommunityMembership(member, community))?.roles).toEqual(
      ['member'],
    )
    expect(apply).toHaveBeenCalled()
    verified = { state: 'active', roles: ['member', 'moderator'] }
    await consumer.reconcileAuthorities()
    expect(
      (await db.getCommunityMembership(member, community))?.roles,
    ).toContain('moderator')
    verified = { state: 'active', roles: ['member'] }
    await consumer.reconcileAuthorities()
    expect(apply.mock.calls.at(-1)?.[2].roles).toEqual(['member'])
  })
  it('drops cached powers and revokes room access when verification is unavailable', async () => {
    await db.setCommunityMembership(member, community, 'active', ['owner'])
    unavailable = true
    await expect(consumer.refreshMembership(community, member)).rejects.toThrow(
      'unavailable',
    )
    expect(await db.getCommunityMembership(member, community)).toEqual({
      state: 'suspended',
      roles: [],
    })
    expect(revoke).toHaveBeenCalled()
  })
})
