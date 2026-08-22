import type { Logger } from 'pino'
import { IdResolver } from '@atproto/identity'
import { Firehose } from '@atproto/sync'
import type { CommitEvt, Event } from '@atproto/sync'
import { ChatModerationEngine } from './chat-moderation.js'
import type { Config } from './config.js'
import { parseConstitution } from './constitution.js'
import type { IBridgeDatabase } from './db/index.js'
import type { MatrixProjectionPort } from './matrix-projection.js'
import type { BridgeMetrics } from './metrics.js'
import { ProposalEngine } from './proposals.js'
import { assignChamberBalanced, assignChamberVerifiable } from './sortition.js'

const CURSOR_SAVE_INTERVAL_MS = 30000

/**
 * ATProto firehose consumer — the governance half of the bridge (CD-M2).
 * Consumes PARA community records, decides governance state (membership,
 * chambers via verifiable sortition, constitutions, proposals, votes) and
 * expresses room effects through MatrixProjectionPort. All MXID handling
 * lives behind that port; this file speaks DIDs only.
 */
export class FirehoseConsumer {
  private firehose: Firehose
  private db: IBridgeDatabase
  private projection: MatrixProjectionPort
  private metrics: BridgeMetrics
  private proposals: ProposalEngine
  private chatMod: ChatModerationEngine
  private log: Logger
  private lastSeq: number | undefined
  private initialCursor: number | undefined
  private cursorSaveTimer: NodeJS.Timeout | null = null

  constructor(
    config: Config,
    db: IBridgeDatabase,
    projection: MatrixProjectionPort,
    proposals: ProposalEngine,
    chatMod: ChatModerationEngine,
    metrics: BridgeMetrics,
    log: Logger,
  ) {
    this.db = db
    this.projection = projection
    this.proposals = proposals
    this.chatMod = chatMod
    this.metrics = metrics
    this.log = log

    const idResolver = new IdResolver()

    this.firehose = new Firehose({
      service: config.pdsFirehoseUrl,
      idResolver,
      filterCollections: [
        'com.para.community.board',
        'com.para.community.membership',
        'com.para.community.constitution',
        'com.para.community.proposal',
        'com.para.community.vote',
      ],
      unauthenticatedCommits: true,
      handleEvent: (evt) => this.handleEvent(evt),
      onError: (err) => {
        this.log.error({ err }, 'Firehose error')
      },
      getCursor: () => this.initialCursor ?? undefined,
    })
  }

  async start(): Promise<void> {
    this.log.info(
      { url: this.firehose.opts.service },
      'Starting firehose consumer',
    )
    this.initialCursor = await this.db.getSyncCursor()
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

  private async handleEvent(evt: Event): Promise<void> {
    if (evt.seq !== undefined) {
      this.lastSeq = evt.seq
    }

    const lag = Date.now() - new Date(evt.time).getTime()
    this.metrics.firehoseLag.set(lag / 1000)

    if (evt.event === 'create' || evt.event === 'update') {
      await this.handleCommit(evt)
    }
  }

  private async handleCommit(evt: CommitEvt): Promise<void> {
    const { collection, did } = evt

    if (evt.event === 'delete') return

    if (collection === 'com.para.community.board' && evt.event === 'create') {
      await this.handleCommunityCreate(did, evt.record)
    } else if (collection === 'com.para.community.membership') {
      await this.handleMembershipChange(did, evt.record, evt.event)
    } else if (collection === 'com.para.community.constitution') {
      await this.handleConstitutionUpdate(did, evt.record)
    } else if (
      collection === 'com.para.community.proposal' &&
      evt.event === 'create'
    ) {
      await this.handleProposalCreate(did, evt.record)
    } else if (
      collection === 'com.para.community.vote' &&
      evt.event === 'create'
    ) {
      await this.handleVoteCast(did, evt.record)
    }
  }

  private async handleCommunityCreate(
    creatorDid: string,
    record: any,
  ): Promise<void> {
    if (!record) return
    const slug = (record.slug ?? 'community') as string
    const name = (record.name ?? 'Unnamed Community') as string
    const chamberMode = (record.chamberMode ?? 'unicameral') as string
    const communityUri = `at://${creatorDid}/com.para.community.board/${slug}`

    const existing = await this.db.getSpaceForCommunity(communityUri)
    if (existing) {
      this.log.debug({ communityUri }, 'Community space already exists')
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
      })
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

      await this.db.setCommunityMembership(creatorDid, communityUri, 'active', [
        'owner',
      ])
      await this.projection.installOwner(provisioned.spaceId, creatorDid)
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

  private async handleMembershipChange(
    userDid: string,
    record: any,
    action: 'create' | 'update' | 'delete',
  ): Promise<void> {
    if (!record) return
    const communityUri = record.community as string
    const state = record.membershipState as string
    const roles = (record.roles ?? []) as string[]
    const isObserver = roles.includes('observer')
    await this.db.setCommunityMembership(userDid, communityUri, state, roles)

    const space = await this.db.getSpaceForCommunity(communityUri)
    if (!space) {
      this.log.debug(
        { communityUri },
        'No Matrix space found for community, skipping membership sync',
      )
      return
    }

    const end = this.metrics.syncLatency.startTimer({
      event_type: state === 'active' ? 'invite' : 'kick',
    })
    try {
      if (state === 'active' && (action === 'create' || action === 'update')) {
        let chamberRoomId: string | null = null
        let chamber: 'A' | 'B' | null = null

        if (space.chamberMode === 'bicameral' && !isObserver) {
          chamber = await this.decideChamber(communityUri, userDid)
        }

        const invited = await this.projection.inviteMember(space, userDid, {
          roles,
          chamber,
          isObserver,
        })
        chamberRoomId = invited.chamberRoomId

        await this.chatMod.recordMembership(userDid, communityUri, chamberRoomId ?? space.spaceId, {
          isModerator: roles.includes('moderator') || roles.includes('owner'),
          isDelegate: roles.includes('delegate'),
          chamber: chamber ?? null,
        })

        await this.db.logSync(
          'invite',
          communityUri,
          userDid,
          space.spaceId,
          true,
        )
      } else if (
        (state === 'left' || state === 'removed' || state === 'blocked') &&
        action === 'update'
      ) {
        await this.projection.kickMember(space, userDid, state)
        await this.db.logSync(
          'kick',
          communityUri,
          userDid,
          space.spaceId,
          true,
        )
      }
    } catch (err: any) {
      const eventType = state === 'active' ? 'invite' : 'kick'
      if (state === 'active') {
        this.metrics.invitesTotal.inc({
          community_uri: communityUri,
          status: 'failure',
        })
      } else {
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
    } finally {
      end()
    }
  }

  /**
   * Governance decision: which chamber does this member belong to? Verifiable
   * sortition via drand, deterministic fallback if the beacon is unreachable.
   */
  private async decideChamber(
    communityUri: string,
    userDid: string,
  ): Promise<'A' | 'B'> {
    const existing = await this.db.getChamberAssignment(communityUri, userDid)
    if (existing === 'A' || existing === 'B') return existing

    const countA = await this.db.getChamberMemberCount(communityUri, 'A')
    const countB = await this.db.getChamberMemberCount(communityUri, 'B')

    let chamber: 'A' | 'B'
    try {
      const proof = await assignChamberVerifiable(
        userDid,
        communityUri,
        countA,
        countB,
      )
      chamber = proof.chamber
      await this.db.saveSortitionProof({
        did: proof.did,
        communityUri: proof.communityUri,
        chamber: proof.chamber,
        drandRound: proof.round,
        drandRandomness: proof.randomness,
        hashInput: proof.hashInput,
        hashOutput: proof.hashOutput,
        threshold: proof.threshold,
        timestamp: proof.timestamp,
      })
      this.metrics.sortitionDrandTotal.inc()
      this.log.info(
        { communityUri, userDid, chamber, drandRound: proof.round },
        'Assigned user to chamber via verifiable sortition (drand)',
      )
    } catch (err: any) {
      // Fallback to deterministic djb2Hash if drand is unreachable
      chamber = assignChamberBalanced(userDid, communityUri, countA, countB)
      this.metrics.sortitionFallbackTotal.inc()
      this.log.warn(
        { err: err.message, communityUri, userDid, chamber },
        'drand failed, using fallback sortition',
      )
    }

    await this.db.setChamberAssignment(communityUri, userDid, chamber)
    return chamber
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
      this.log.info(
        { community: constitution.community, version: constitution.version },
        'Constitution updated',
      )
    } catch (err: any) {
      this.log.error({ err, did, record }, 'Failed to parse constitution')
    }
  }

  private async handleProposalCreate(did: string, record: any): Promise<void> {
    if (!record) return
    const communityUri = record.community as string
    const title = (record.title ?? 'Untitled') as string
    const body = (record.body ?? '') as string
    const proposalType = (record.type ?? 'general') as string
    const budgetRequest =
      typeof record.budgetRequest === 'number' ? record.budgetRequest : null
    const createdAt = (record.createdAt ?? new Date().toISOString()) as string
    const uri = `at://${did}/com.para.community.proposal/${Date.now()}`

    await this.proposals.onProposalCreated(
      uri,
      communityUri,
      did,
      title,
      body,
      proposalType,
      budgetRequest,
      createdAt,
    )
  }

  private async handleVoteCast(did: string, record: any): Promise<void> {
    if (!record) return
    const proposalUri = record.proposal as string
    const communityUri = record.community as string
    // The lexicon uses `signal` (integer -3..3) rather than a string `choice`.
    const signal = Number(record.signal)
    const choice = signalToChoice(signal)
    if (!choice) {
      this.log.warn(
        { did, proposalUri, signal },
        'Ignoring vote with unrecognized signal',
      )
      return
    }
    const createdAt = (record.createdAt ?? new Date().toISOString()) as string
    const uri = `at://${did}/com.para.community.vote/${Date.now()}`

    await this.proposals.onVoteCast(
      uri,
      proposalUri,
      communityUri,
      did,
      choice,
      createdAt,
    )
  }
}

export function signalToChoice(
  signal: number,
): 'for' | 'against' | 'abstain' | null {
  if (signal > 0) return 'for'
  if (signal < 0) return 'against'
  if (signal === 0) return 'abstain'
  return null
}
