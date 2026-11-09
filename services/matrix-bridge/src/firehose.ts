import type { Logger } from 'pino'
import { IdResolver } from '@atproto/identity'
import { Firehose } from '@atproto/sync'
import type { CommitEvt, Event } from '@atproto/sync'
import { CHAT_DISABLED, isProvisionedSpace } from './chat-mode.js'
import type { AuthorityResolver } from './community-authority.js'
import {
  communityAlias,
  communityDidOf,
  communityProfileUri,
} from './community-uri.js'
import type { Config } from './config.js'
import { parseConstitution } from './constitution.js'
import type { IBridgeDatabase } from './db/index.js'
import type { EventBus } from './events/bus.js'
import { readBoundedJson } from './http-response.js'
import { HttpError } from './m8-auth.js'
import type { MatrixProjectionPort } from './matrix-projection.js'
import type { BridgeMetrics } from './metrics.js'

const CURSOR_SAVE_INTERVAL_MS = 30000
const MAX_REMEMBERED_FOUNDERS = 1000

/**
 * Projects community records and externally verified membership/roles onto chat.
 * Identity handling belongs to MatrixProjectionPort.
 */
export class FirehoseConsumer {
  private firehose: Firehose
  private db: IBridgeDatabase
  private projection: MatrixProjectionPort
  private metrics: BridgeMetrics
  private log: Logger
  private lastSeq: number | undefined
  private lastEventTime: string | undefined
  private lastReceivedAt: string | undefined
  private initialCursor: number | undefined
  private pdsSourceId: string | undefined
  private cursorSaveTimer: NodeJS.Timeout | null = null

  private events?: EventBus
  private authorityWork = new Map<string, Promise<void>>()
  /** Founder of each community seen founded, newest kept (see handleChainEvent). */
  private founders = new Map<string, string>()

  constructor(
    private config: Config,
    db: IBridgeDatabase,
    projection: MatrixProjectionPort,
    metrics: BridgeMetrics,
    log: Logger,
    private authority?: AuthorityResolver,
  ) {
    this.db = db
    this.projection = projection
    this.metrics = metrics
    this.log = log
    this.pdsSourceId = config.pdsSourceId

    // PLC_URL is a dev-mode escape hatch: local PLCs (http://localhost:2582)
    // are unreachable through the SSRF-guarded default fetch (allowHttp off,
    // private IPs off), so an explicit opt-out supplies an unguarded fetch.
    const idResolver = new IdResolver({
      plcUrl: config.plcUrl,
      fetch: config.plcUrl ? globalThis.fetch : undefined,
    })

    this.firehose = new Firehose({
      service: config.pdsFirehoseUrl,
      idResolver,
      filterCollections: [
        'com.para.community.profile',
        'com.para.community.event',
        'com.para.community.constitution',
      ],
      unauthenticatedCommits: true,
      handleEvent: (evt) => this.handleEvent(evt),
      onError: (err) => {
        const unsafeSeq = unsafeFirehoseSeq(err)
        if (unsafeSeq !== undefined) throw new UnsafeFirehoseSeqError(unsafeSeq)
        this.log.error({ err }, 'Firehose error')
        const cause = (err as Error & { cause?: unknown }).cause
        if (cause instanceof UnsafeFirehoseSeqError) throw cause
        if (
          cause instanceof Error &&
          cause.message.includes('Cursor in the future')
        ) {
          throw new Error(
            'Bridge firehose cursor is ahead of this PDS. Check BRIDGE_PDS_SOURCE_ID and BRIDGE_DB_PATH; refusing to retry.',
            { cause: err },
          )
        }
      },
      // Connection failures never reach onError: without this, a wrong URL or
      // an unreachable PDS retries forever with zero log output (exactly the
      // failure mode that left this consumer silently indexing nothing).
      onReconnectError: (err, attempt, initialSetup) => {
        this.log.warn(
          { err, attempt, initialSetup, service: config.pdsFirehoseUrl },
          'Firehose connection failed, reconnecting',
        )
      },
      getCursor: () =>
        this.lastSeq ??
        this.initialCursor ??
        (config.backfillFromStart ? 0 : undefined),
    })
  }

  /** Late-injected SSE bus (main wires it after construction). */
  setEventBus(events: EventBus): void {
    this.events = events
  }

  async start(): Promise<void> {
    this.log.info(
      { url: this.firehose.opts.service },
      'Starting firehose consumer',
    )
    this.initialCursor = await prepareFirehoseCursor(this.db, this.pdsSourceId)
    if (this.initialCursor) {
      this.log.info(
        { cursor: this.initialCursor },
        'Resuming firehose from cursor',
      )
    }
    this.cursorSaveTimer = setInterval(() => {
      void (async () => {
        if (this.lastSeq !== undefined) {
          await this.db.setSyncCursor(this.lastSeq)
        }
      })()
    }, CURSOR_SAVE_INTERVAL_MS)
    await this.firehose.start()
  }

  async stop(): Promise<void> {
    this.log.info('Stopping firehose consumer')
    if (this.cursorSaveTimer) {
      clearInterval(this.cursorSaveTimer)
    }
    if (this.lastSeq !== undefined) {
      await this.db.setSyncCursor(this.lastSeq)
    }
    this.firehose.destroy().catch((err) => {
      this.log.error({ err }, 'Error destroying firehose')
    })
  }

  /** For the private operations listener: how fresh ingestion is. */
  ingestionStatus() {
    return {
      lastEventTime: this.lastEventTime ?? null,
      lastReceivedAt: this.lastReceivedAt ?? null,
      lastEventLagSeconds:
        this.lastEventTime && this.lastReceivedAt
          ? Math.max(
              0,
              (Date.parse(this.lastReceivedAt) -
                Date.parse(this.lastEventTime)) /
                1000,
            )
          : null,
    }
  }

  private async handleEvent(evt: Event): Promise<void> {
    if (evt.seq !== undefined) {
      this.lastSeq = evt.seq
    }
    this.lastEventTime = evt.time
    this.lastReceivedAt = new Date().toISOString()

    const lag = Date.now() - new Date(evt.time).getTime()
    this.metrics.firehoseLag.set(lag / 1000)

    if (evt.event === 'create' || evt.event === 'update') {
      await this.handleCommit(evt)
    }
  }

  private async handleCommit(evt: CommitEvt): Promise<void> {
    const { collection, did } = evt

    if (evt.event === 'delete') return

    if (collection === 'com.para.community.profile') {
      // A community is an account (OD-9): its profile is created in the
      // commit that founds it. The founder is named by the founding event
      // just before it; failing that, the community itself stands in and the
      // first verified refresh settles who belongs.
      if (evt.event === 'create' && evt.rkey === 'self') {
        await this.handleCommunityCreate(
          this.founders.get(did) ?? did,
          evt.record,
          evt.uri.toString(),
          communityAlias(did),
        )
      }
    } else if (collection === 'com.para.community.event') {
      await this.handleChainEvent(did, evt.record)
    } else if (collection === 'com.para.community.constitution') {
      await this.handleConstitutionUpdate(did, evt.record)
    }
  }

  /**
   * A community's chain event. The bridge learns nothing from it but who to
   * re-check: the authority service decides what the member is now, so a
   * member's own claim is never an input. Content, relation, briefing and
   * profile events change no membership.
   */
  private async handleChainEvent(
    communityDid: string,
    record: any,
  ): Promise<void> {
    const action = typeof record?.action === 'string' ? record.action : ''
    if (!record || typeof record.subject !== 'string') return
    if (action === 'community.found') {
      if (this.founders.size >= MAX_REMEMBERED_FOUNDERS) {
        this.founders.delete(this.founders.keys().next().value as string)
      }
      this.founders.set(communityDid, record.subject)
    }
    if (/^(content|relation|briefing|profile)\./.test(action)) return
    const community = communityProfileUri(communityDid)
    const subjects = new Set<string>([record.subject])
    if (/^(owner|moderator)\./.test(action) && typeof record.actor === 'string')
      subjects.add(record.actor)
    for (const subject of subjects)
      await this.refreshMembership(community, subject)
  }

  /** Retry from the current record at this configured PDS, never a stale payload. */
  async retryCommunityProvision(
    communityUri: string,
    creatorDid: string,
  ): Promise<void> {
    const communityDid = communityDidOf(communityUri)
    if (!communityDid) throw new Error('Invalid community provisioning job')
    const rkey = 'self'
    const base = this.config.pdsFirehoseUrl.replace(/^ws/, 'http')
    const url = new URL('/xrpc/com.atproto.repo.getRecord', base)
    url.searchParams.set('repo', communityDid)
    url.searchParams.set('collection', 'com.para.community.profile')
    url.searchParams.set('rkey', rkey)
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    })
    if (response.status === 400 || response.status === 404) {
      const error = await readBoundedJson<{ error?: string }>(response, 16_384)
      if (error.error === 'RecordNotFound') return
    }
    if (!response.ok)
      throw new Error('Community record unavailable for provisioning retry')
    const record = await readBoundedJson<{ uri: string; value: unknown }>(
      response,
      262_144,
    )
    if (record.uri !== communityUri)
      throw new Error('Provisioning record URI mismatch')
    await this.handleCommunityCreate(
      creatorDid,
      record.value,
      communityUri,
      communityAlias(communityDid),
      true,
    )
  }

  /**
   * @param communityUri the community account's profile at-uri, as the
   *   firehose reports it. Authority is asked of the AppView by exactly this
   *   string, and the space is looked up by it; never rebuild it from a name.
   * @param slug the room-alias localpart, unique per community account (see
   *   `communityAlias`), where a constant would make every community fight
   *   over one alias.
   */
  private async handleCommunityCreate(
    creatorDid: string,
    record: any,
    communityUri: string,
    slug: string,
    retry = false,
  ): Promise<void> {
    if (!record) return
    const name = (record.name ?? 'Unnamed Community') as string
    const chamberMode = (record.chamberMode ?? 'unicameral') as string

    const existing = await this.db.getSpaceForCommunity(communityUri)
    // A row recorded while chat was off is provisioned once chat is on.
    if (
      existing &&
      (isProvisionedSpace(existing) || !this.config.matrixChatEnabled)
    ) {
      this.log.debug({ communityUri }, 'Community space already exists')
      if (retry) await this.refreshMembership(communityUri, creatorDid, true)
      return
    }

    const end = this.metrics.syncLatency.startTimer({
      event_type: 'create_space',
    })
    try {
      const provisioned = await this.projection.createCommunitySpace({
        name,
        slug,
        chamberMode,
        communityUri,
      })
      await this.db.transaction(async () => {
        await this.db.setSpaceForCommunity(
          communityUri,
          provisioned.spaceId,
          slug,
          chamberMode,
        )
        if (chamberMode === 'bicameral') {
          await this.db.setChamberRooms(
            communityUri,
            provisioned.chamberA_RoomId,
            provisioned.chamberB_RoomId,
            provisioned.observerRoomId,
          )
        }
      })
      if (!isProvisionedSpace(provisioned)) {
        // Chat is off: governance has its row, the rooms come later. The
        // failed create_space entry is the provisioning queue the retry
        // worker drains once chat is on.
        this.log.info(
          { communityUri, chamberMode },
          'Recorded community without chat rooms (chat disabled)',
        )
        await this.refreshMembership(communityUri, creatorDid)
        await this.db.logSync(
          'create_space',
          communityUri,
          creatorDid,
          null,
          false,
          CHAT_DISABLED,
        )
        return
      }
      this.metrics.spacesCreatedTotal.inc({ status: 'success' })
      this.log.info(
        { communityUri, spaceId: provisioned.spaceId, name, chamberMode },
        'Created Matrix space for community',
      )
      if (chamberMode === 'bicameral') {
        this.log.info(
          {
            communityUri,
            chamberA: provisioned.chamberA_RoomId,
            chamberB: provisioned.chamberB_RoomId,
            observerRoom: provisioned.observerRoomId,
          },
          'Created bicameral chamber rooms',
        )
      }

      // Post-CD-M1 the creator is not pushed into anything: membership is
      // recorded here (governance) and the owner joins by presenting a
      // verified proof of possession (CD-M6 verified join), like every other
      // member.
      await this.refreshMembership(communityUri, creatorDid)
      await this.db.logSync(
        'create_space',
        communityUri,
        creatorDid,
        provisioned.spaceId,
        true,
      )
    } catch (err: any) {
      this.metrics.spacesCreatedTotal.inc({ status: 'failure' })
      this.log.error(
        { err, communityUri },
        'Failed to create Matrix space for community',
      )
      if (retry) throw err
      await this.db.logSync(
        'create_space',
        communityUri,
        creatorDid,
        null,
        false,
        err.message,
      )
    } finally {
      end()
    }
  }

  /** Refresh from verified authority; self-authored roles are never an input. */
  async refreshMembership(
    communityUri: string,
    did: string,
    force = false,
  ): Promise<void> {
    const key = JSON.stringify([communityUri, did])
    const previous = this.authorityWork.get(key) ?? Promise.resolve()
    const work = previous
      .catch(() => {})
      .then(async () => {
        try {
          await this.handleMembershipChange(
            did,
            { community: communityUri, force },
            'update',
          )
        } catch (err) {
          // @NOTE availability never preserves a cached privileged grant.
          await this.db.setCommunityMembership(
            did,
            communityUri,
            'suspended',
            [],
          )
          const space = await this.db.getSpaceForCommunity(communityUri)
          if (space)
            await this.projection.revokeMemberAccess(
              space,
              did,
              'Verified authority unavailable',
            )
          throw new HttpError(503, 'Verified community authority unavailable')
        }
      })
    this.authorityWork.set(key, work)
    try {
      await work
    } finally {
      if (this.authorityWork.get(key) === work) this.authorityWork.delete(key)
    }
  }

  /** Reconcile existing state, including stale grants, delayed indexing and expiry. */
  async reconcileAuthorities(force = false): Promise<void> {
    let offset = 0
    while (true) {
      const rows = await this.db.listCommunityMemberships(100, offset)
      let failed = false
      for (const row of rows) {
        try {
          await this.refreshMembership(row.communityUri, row.did, force)
        } catch (err) {
          failed = true
          this.log.error({ err, did: row.did }, 'Authority refresh failed')
        }
      }
      if (failed && force)
        throw new Error('Initial verified authority reconciliation failed')
      if (rows.length < 100) break
      offset += rows.length
    }
  }

  private async handleMembershipChange(
    userDid: string,
    record: any,
    action: 'create' | 'update' | 'delete',
  ): Promise<void> {
    if (!record) return
    const communityUri = record.community as string
    if (!this.authority)
      throw new Error('Verified authority resolver is required')
    const { state, roles } = await this.authority(communityUri, userDid)
    const previous = await this.db.getCommunityMembership(userDid, communityUri)
    if (
      !record.force &&
      previous?.state === state &&
      JSON.stringify([...previous.roles].sort()) ===
        JSON.stringify([...roles].sort())
    )
      return
    await this.db.setCommunityMembership(userDid, communityUri, state, roles)
    if (this.events) {
      // Community-visible; no direct audience — members see joins/leaves.
      await this.events.publish({
        type: 'membership.changed',
        communityUri,
        audienceDids: [userDid],
        payload: { did: userDid, state, roles },
      })
    }

    const space = await this.db.getSpaceForCommunity(communityUri)
    if (!space) {
      this.log.debug(
        { communityUri },
        'No Matrix space found for community, skipping membership sync',
      )
      return
    }

    const isJoin =
      state === 'active' && (action === 'create' || action === 'update')
    const isRemoval = state !== 'active'
    const end = this.metrics.syncLatency.startTimer({
      event_type: isJoin ? 'join_deferred' : isRemoval ? 'revoke' : 'noop',
    })
    try {
      if (isJoin) {
        // Post-CD-M1 (F7): the bridge cannot name the member — the MXID is a
        // hash of client-held key material — so it does not invite. It
        // records the governance decision and the member joins by presenting
        // a verified proof of possession (CD-M6, /api/community-join). The
        // membership.changed SSE event above is the client's signal.
        if (action === 'update') {
          // The handover protocol: a membership *update* while active is a
          // role change (moderation rotation,
          // owner handover). Project the new roles onto the rooms the member
          // already occupies — through the chat accounts this bridge minted
          // sessions for, the only ones it can name.
          await this.projection.applyMemberRoles(space, userDid, {
            roles,
            chamber: null,
            isObserver: false,
          })
          await this.db.logSync(
            'apply_roles',
            communityUri,
            userDid,
            space.spaceId,
            true,
          )
        } else {
          await this.db.logSync(
            'join_deferred',
            communityUri,
            userDid,
            space.spaceId,
            true,
          )
        }
      } else if (isRemoval) {
        // The bridge cannot kick a DID it cannot name; it revokes what it
        // holds: known chat accounts are banned from this community's rooms. Re-entry fails at the next
        // verified join's active-membership check.
        await this.projection.revokeMemberAccess(space, userDid, state)
        await this.db.logSync(
          'revoke',
          communityUri,
          userDid,
          space.spaceId,
          true,
        )
      }
    } catch (err: any) {
      const eventType = isJoin
        ? action === 'update'
          ? 'apply_roles'
          : 'join_deferred'
        : isRemoval
          ? 'revoke'
          : 'noop'
      if (isRemoval) {
        this.metrics.kicksTotal.inc({
          community_uri: communityUri,
          status: 'failure',
        })
      }
      this.log.error(
        { err, communityUri, userDid, state },
        'Failed to sync membership to Matrix',
      )
      await this.db.logSync(
        eventType,
        communityUri,
        userDid,
        space.spaceId,
        false,
        err.message,
      )
      throw err
    } finally {
      end()
    }
  }

  private async handleConstitutionUpdate(
    did: string,
    record: any,
  ): Promise<void> {
    if (!record) return
    try {
      const constitution = parseConstitution(record)
      await this.db.setConstitution(
        constitution.community,
        constitution.version,
        JSON.stringify(constitution.rules),
      )

      if (this.events) {
        await this.events.publish({
          type: 'constitution.updated',
          communityUri: constitution.community,
          payload: { version: constitution.version },
        })
      }
      this.log.info(
        { community: constitution.community, version: constitution.version },
        'Constitution updated',
      )
    } catch (err: any) {
      this.log.error({ err, did, record }, 'Failed to parse constitution')
    }
  }
}

/**
 * A frame whose seq decoded above 2^53 (CBOR yields a bigint, which the
 * subscribeRepos schema rejects): a raw vlpds stream, whose seq is
 * unix_micros × 256 + writer. @atproto/sync would drop every such frame, and
 * the cursor is a JS number, so consume the relay's renumbered stream instead.
 */
export function unsafeFirehoseSeq(err: unknown): bigint | undefined {
  const seq = (err as { value?: { seq?: unknown } } | null)?.value?.seq
  return typeof seq === 'bigint' ? seq : undefined
}

export class UnsafeFirehoseSeqError extends Error {
  constructor(seq: bigint) {
    super(
      `Firehose seq ${seq} exceeds the safe integer range. Point PDS_FIREHOSE_URL at a relay that renumbers the stream; refusing to drop events.`,
    )
  }
}

/** Refuse to reuse a cursor against a different PDS data generation. */
export async function prepareFirehoseCursor(
  db: Pick<
    IBridgeDatabase,
    'getSyncCursor' | 'getSyncSource' | 'setSyncSource'
  >,
  sourceId?: string,
): Promise<number | undefined> {
  const cursor = await db.getSyncCursor()
  if (!sourceId) return cursor
  const storedSource = await db.getSyncSource()
  if (storedSource && storedSource !== sourceId) {
    throw new Error(
      `Bridge database belongs to PDS source ${storedSource}, not ${sourceId}`,
    )
  }
  if (!storedSource && cursor !== undefined) {
    throw new Error(
      'Bridge database has a cursor without a PDS source. Use a new bridge database for this dev profile.',
    )
  }
  if (!storedSource) await db.setSyncSource(sourceId)
  return cursor
}
