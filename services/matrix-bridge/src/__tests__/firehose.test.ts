import type { AddressInfo } from 'node:net'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatModerationEngine } from '../chat-moderation.js'
import type { TrustedMembership } from '../community-authority.js'
import type { Config } from '../config.js'
import { SqliteBridgeDatabase } from '../db/index.js'
import { WebSocketServer } from 'ws'
import {
  FirehoseConsumer,
  UnsafeFirehoseSeqError,
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

describe('firehose seq beyond 2^53', () => {
  /** A #commit frame whose only body field is a uint64 seq (CBOR, canonical key order). */
  const frame = (seq: bigint) => {
    const text = (value: string) => [0x60 + value.length, ...Buffer.from(value)]
    const uint64 = Buffer.alloc(8)
    uint64.writeBigUInt64BE(seq)
    return Buffer.from([
      ...[0xa2, ...text('t'), ...text('#commit'), ...text('op'), 0x01],
      ...[0xa1, ...text('seq'), 0x1b, ...uint64],
    ])
  }

  it('refuses a raw vlpds stream instead of dropping its frames', async () => {
    // unix_micros × 256 + writer, as vlpds numbers its firehose.
    const seq = 1_793_000_000_000_000n * 256n + 7n
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    server.on('connection', (socket) => socket.send(frame(seq)))
    await new Promise((resolve) => server.once('listening', resolve))
    const config = {
      dbPath: ':memory:',
      pdsFirehoseUrl: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
      backfillFromStart: false,
    } as Config
    const db = new SqliteBridgeDatabase(config)
    const log = pino({ level: 'silent' })
    const consumer = new FirehoseConsumer(
      config,
      db,
      {} as MatrixProjectionPort,
      {} as ProposalEngine,
      new ChatModerationEngine(db, log),
      new BridgeMetrics(),
      log,
    )
    try {
      const started = consumer.start()
      await expect(started).rejects.toBeInstanceOf(UnsafeFirehoseSeqError)
      await expect(started).rejects.toThrow(String(seq))
      expect(await db.getSyncCursor()).toBeUndefined()
    } finally {
      await consumer.stop()
      await new Promise((resolve) => server.close(resolve))
      await db.close()
    }
  })
})

describe('firehose trusted role projection', () => {
  const communityDid = 'did:plc:owner'
  const community = `at://${communityDid}/com.para.community.profile/self`
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
  /** A chain event in the community's repo: all the bridge learns from it is whom to re-check. */
  const ingest = async (record: Record<string, unknown>) => {
    await (
      consumer as unknown as { handleCommit(evt: unknown): Promise<void> }
    ).handleCommit({
      collection: 'com.para.community.event',
      did: communityDid,
      event: 'create',
      record: { seq: 2, actor: member, subject: member, ...record },
    })
  }

  it.each(['owner', 'moderator', 'delegate', 'observer'])(
    'ignores a self-declared %s on a join event',
    async (role) => {
      await ingest({ action: 'member.join', roles: [role, 'owner'] })
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
  it('does not infer owner authority from the community DID', async () => {
    await ingest({
      action: 'member.join',
      actor: communityDid,
      subject: communityDid,
    })
    expect(
      (await db.getCommunityMembership(communityDid, community))?.roles,
    ).toEqual(['member'])
  })
  it('projects a verified moderator and then revokes the grant', async () => {
    verified = { state: 'active', roles: ['member', 'moderator'] }
    await ingest({ action: 'moderator.accept', actor: member })
    expect(apply.mock.calls.at(-1)?.[2].roles).toContain('moderator')
    expect(
      (await db.getParticipationStats(member, community)).is_moderator,
    ).toBe(1)
    verified = { state: 'active', roles: ['member'] }
    await ingest({
      action: 'moderator.revoke',
      actor: communityDid,
      subject: member,
    })
    expect(apply.mock.calls.at(-1)?.[2].roles).toEqual(['member'])
    expect(
      (await db.getParticipationStats(member, community)).is_moderator,
    ).toBe(0)
  })
  it('removes access when the authority service says the member was removed', async () => {
    verified = { state: 'removed', roles: [] }
    await ingest({ action: 'member.remove', actor: communityDid })
    expect((await db.getCommunityMembership(member, community))?.state).toBe(
      'removed',
    )
    expect(revoke).toHaveBeenCalledWith(expect.anything(), member, 'removed')
  })
  it.each([
    'content.hide',
    'relation.link',
    'briefing.publish',
    'profile.update',
  ])('does not re-check anyone for a %s event', async (action) => {
    await ingest({ action })
    expect(await db.getCommunityMembership(member, community)).toBeUndefined()
    expect(apply).not.toHaveBeenCalled()
  })
  it('names the founder of a community, and ignores a profile it did not found', async () => {
    const provision = vi
      .spyOn(
        consumer as unknown as {
          handleCommunityCreate(...args: unknown[]): Promise<void>
        },
        'handleCommunityCreate',
      )
      .mockResolvedValue()
    const profile = async (did: string, rkey = 'self') =>
      (
        consumer as unknown as { handleCommit(evt: unknown): Promise<void> }
      ).handleCommit({
        collection: 'com.para.community.profile',
        did,
        event: 'create',
        rkey,
        uri: `at://${did}/com.para.community.profile/${rkey}`,
        record: { name: 'Norte' },
      })
    verified = { state: 'active', roles: ['member', 'owner'] }
    await ingest({ action: 'community.found', actor: member })
    await profile(communityDid)
    expect(provision).toHaveBeenCalledWith(
      member,
      { name: 'Norte' },
      community,
      'owner',
    )
    await profile('did:plc:other', 'not-self')
    expect(provision).toHaveBeenCalledTimes(1)
    await profile('did:plc:stranger')
    expect(provision).toHaveBeenLastCalledWith(
      'did:plc:stranger',
      { name: 'Norte' },
      'at://did:plc:stranger/com.para.community.profile/self',
      'stranger',
    )
  })
  it('refuses to retry provisioning for anything but a community profile', async () => {
    for (const uri of [
      'at://did:plc:owner/com.para.community.board/one',
      'at://did:plc:owner/com.para.community.profile/other',
      'not a uri',
    ]) {
      await expect(
        consumer.retryCommunityProvision(uri, member),
      ).rejects.toThrow('Invalid community provisioning job')
    }
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
