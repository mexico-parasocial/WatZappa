import type { Logger } from 'pino'
import { IdResolver } from '@atproto/identity'
import { Firehose } from '@atproto/sync'
import type { CommitEvt, Event } from '@atproto/sync'
import { ChatModerationEngine } from './chat-moderation.js'
import type { Config } from './config.js'
import { parseConstitution } from './constitution.js'
import type { BridgeDatabase } from './db.js'
import type { MatrixAdminClient } from './matrix.js'
import { didToMxid, extractServerName } from './matrix.js'
import type { BridgeMetrics } from './metrics.js'
import { ProposalEngine } from './proposals.js'
import { assignChamberBalanced, assignChamberVerifiable } from './sortition.js'

const CURSOR_SAVE_INTERVAL_MS = 30000

export class FirehoseConsumer {
  private firehose: Firehose
  private db: BridgeDatabase
  private matrix: MatrixAdminClient
  private metrics: BridgeMetrics
  private proposals: ProposalEngine
  private chatMod: ChatModerationEngine
  private log: Logger
  private serverName: string
  private lastSeq: number | undefined
  private cursorSaveTimer: NodeJS.Timeout | null = null

  constructor(
    config: Config,
    db: BridgeDatabase,
    matrix: MatrixAdminClient,
    metrics: BridgeMetrics,
    log: Logger,
  ) {
    this.db = db
    this.matrix = matrix
    this.metrics = metrics
    this.chatMod = new ChatModerationEngine(db, log)
    this.proposals = new ProposalEngine(db, matrix, log, this.chatMod)
    this.log = log
    this.serverName = extractServerName(config.matrixHomeserverUrl)

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
      getCursor: () => {
        const cursor = db.getSyncCursor()
        if (cursor) {
          this.log.info({ cursor }, 'Resuming firehose from cursor')
        }
        return cursor ?? undefined
      },
    })
  }

  async start(): Promise<void> {
    this.log.info(
      { url: this.firehose.opts.service },
      'Starting firehose consumer',
    )
    this.cursorSaveTimer = setInterval(() => {
      if (this.lastSeq !== undefined) {
        this.db.setSyncCursor(this.lastSeq)
      }
    }, CURSOR_SAVE_INTERVAL_MS)
    await this.firehose.start()
  }

  stop(): void {
    this.log.info('Stopping firehose consumer')
    if (this.cursorSaveTimer) {
      clearInterval(this.cursorSaveTimer)
    }
    if (this.lastSeq !== undefined) {
      this.db.setSyncCursor(this.lastSeq)
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

    const existing = this.db.getSpaceForCommunity(communityUri)
    if (existing) {
      this.log.debug({ communityUri }, 'Community space already exists')
      return
    }

    const end = this.metrics.syncLatency.startTimer({
      event_type: 'create_space',
    })
    try {
      const spaceId = await this.matrix.createSpace(name, slug)
      this.db.setSpaceForCommunity(communityUri, spaceId, slug, chamberMode)
      this.metrics.spacesCreatedTotal.inc({ status: 'success' })
      this.log.info(
        { communityUri, spaceId, name, chamberMode },
        'Created Matrix space for community',
      )

      // Create chamber rooms for bicameral communities
      if (chamberMode === 'bicameral') {
        const [chamberA, chamberB, observerRoom] = await Promise.all([
          this.matrix.createRoom(
            `${name} — Cámara A`,
            `${slug}-chamber-a`,
            spaceId,
          ),
          this.matrix.createRoom(
            `${name} — Cámara B`,
            `${slug}-chamber-b`,
            spaceId,
          ),
          this.matrix.createRoom(
            `${name} — Consejo Observador`,
            `${slug}-observers`,
            spaceId,
          ),
        ])

        this.db.setChamberRooms(communityUri, chamberA, chamberB, observerRoom)
        this.log.info(
          { communityUri, chamberA, chamberB, observerRoom },
          'Created bicameral chamber rooms',
        )

        // Link chambers as children of the main space
        await Promise.all([
          this.matrix.addChildSpace(spaceId, chamberA, [this.serverName]),
          this.matrix.addChildSpace(spaceId, chamberB, [this.serverName]),
          this.matrix.addChildSpace(spaceId, observerRoom, [this.serverName]),
        ])
      }

      const creatorMxid = this.ensureMxid(creatorDid)
      this.db.setCommunityMembership(creatorDid, communityUri, 'active', [
        'owner',
      ])
      await this.ensureUserExists(creatorMxid, creatorDid)
      await this.matrix.inviteUser(spaceId, creatorMxid)
      await this.matrix.setPowerLevel(spaceId, creatorMxid, 100)
      this.db.logSync('create_space', communityUri, creatorDid, spaceId, true)
    } catch (err: any) {
      this.metrics.spacesCreatedTotal.inc({ status: 'failure' })
      this.log.error(
        { err, communityUri },
        'Failed to create Matrix space for community',
      )
      this.db.logSync(
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
    this.db.setCommunityMembership(userDid, communityUri, state, roles)

    const space = this.db.getSpaceForCommunity(communityUri)
    if (!space) {
      this.log.debug(
        { communityUri },
        'No Matrix space found for community, skipping membership sync',
      )
      return
    }

    const userMxid = this.ensureMxid(userDid)

    const end = this.metrics.syncLatency.startTimer({
      event_type: state === 'active' ? 'invite' : 'kick',
    })
    try {
      if (state === 'active' && (action === 'create' || action === 'update')) {
        await this.ensureUserExists(userMxid, userDid)

        if (space.chamberMode === 'bicameral' && !isObserver) {
          await this.handleBicameralInvite(
            communityUri,
            space,
            userDid,
            userMxid,
            roles,
          )
        } else if (space.chamberMode === 'bicameral' && isObserver) {
          await this.handleObserverInvite(communityUri, space, userMxid)
        } else {
          // Unicameral: just invite to main space
          const members = await this.matrix.getRoomMembers(space.spaceId)
          const alreadyThere = members.some((m) => m.user_id === userMxid)
          if (!alreadyThere) {
            await this.matrix.inviteUser(space.spaceId, userMxid)
            this.log.info(
              { communityUri, userDid, spaceId: space.spaceId },
              'Invited user to Matrix space',
            )
          }
        }

        let powerLevel = 0
        if (roles.includes('owner')) powerLevel = 100
        else if (roles.includes('moderator')) powerLevel = 50

        await this.matrix.setPowerLevel(space.spaceId, userMxid, powerLevel)

        this.chatMod.recordMembership(userDid, communityUri, space.spaceId, {
          isModerator: roles.includes('moderator') || roles.includes('owner'),
          isDelegate: roles.includes('delegate'),
          chamber: null,
        })

        this.db.logSync('invite', communityUri, userDid, space.spaceId, true)
      } else if (
        (state === 'left' || state === 'removed' || state === 'blocked') &&
        action === 'update'
      ) {
        await this.kickFromAllRooms(space, userMxid, state)
        this.db.logSync('kick', communityUri, userDid, space.spaceId, true)
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
      this.db.logSync(
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

  private async handleBicameralInvite(
    communityUri: string,
    space: any,
    userDid: string,
    userMxid: string,
    roles: string[],
  ): Promise<void> {
    // Assign to chamber via verifiable sortition (drand) with deterministic fallback
    let chamber = this.db.getChamberAssignment(communityUri, userDid)
    if (!chamber) {
      const countA = this.db.getChamberMemberCount(communityUri, 'A')
      const countB = this.db.getChamberMemberCount(communityUri, 'B')

      try {
        const proof = await assignChamberVerifiable(
          userDid,
          communityUri,
          countA,
          countB,
        )
        chamber = proof.chamber
        this.db.saveSortitionProof({
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

      this.db.setChamberAssignment(communityUri, userDid, chamber)
    }

    const chamberRoomId =
      chamber === 'A' ? space.chamberA_RoomId : space.chamberB_RoomId
    if (!chamberRoomId) {
      throw new Error(`Chamber ${chamber} room not found for community`)
    }

    // Invite to main space (for announcements + votes)
    const mainMembers = await this.matrix.getRoomMembers(space.spaceId)
    if (!mainMembers.some((m) => m.user_id === userMxid)) {
      await this.matrix.inviteUser(space.spaceId, userMxid)
    }

    // Invite to chamber room (for deliberation)
    const chamberMembers = await this.matrix.getRoomMembers(chamberRoomId)
    if (!chamberMembers.some((m) => m.user_id === userMxid)) {
      await this.matrix.inviteUser(chamberRoomId, userMxid)
      this.log.info(
        { communityUri, userDid, chamber, roomId: chamberRoomId },
        'Invited user to chamber',
      )
    }

    // Set power level in chamber
    let powerLevel = 0
    if (roles.includes('owner')) powerLevel = 100
    else if (roles.includes('moderator')) powerLevel = 50
    await this.matrix.setPowerLevel(chamberRoomId, userMxid, powerLevel)

    this.chatMod.recordMembership(userDid, communityUri, chamberRoomId, {
      isModerator: roles.includes('moderator') || roles.includes('owner'),
      isDelegate: roles.includes('delegate'),
      chamber: chamber ?? null,
    })
  }

  private async handleConstitutionUpdate(
    did: string,
    record: any,
  ): Promise<void> {
    if (!record) return
    try {
      const constitution = parseConstitution(record)
      this.db.setConstitution(
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

    this.proposals.onProposalCreated(
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
    const choice = record.choice as string
    const createdAt = (record.createdAt ?? new Date().toISOString()) as string
    const uri = `at://${did}/com.para.community.vote/${Date.now()}`

    this.proposals.onVoteCast(
      uri,
      proposalUri,
      communityUri,
      did,
      choice,
      createdAt,
    )
  }

  private async handleObserverInvite(
    communityUri: string,
    space: any,
    userMxid: string,
  ): Promise<void> {
    // Invite to main space
    const mainMembers = await this.matrix.getRoomMembers(space.spaceId)
    if (!mainMembers.some((m) => m.user_id === userMxid)) {
      await this.matrix.inviteUser(space.spaceId, userMxid)
    }

    // Invite to both chamber rooms with read-only access (PL = -1 means no posting)
    if (space.chamberA_RoomId) {
      const chamberAMembers = await this.matrix.getRoomMembers(
        space.chamberA_RoomId,
      )
      if (!chamberAMembers.some((m) => m.user_id === userMxid)) {
        await this.matrix.inviteUser(space.chamberA_RoomId, userMxid)
      }
      // Read-only: can't send messages but can see them
      await this.matrix.setPowerLevel(space.chamberA_RoomId, userMxid, -1)
    }

    if (space.chamberB_RoomId) {
      const chamberBMembers = await this.matrix.getRoomMembers(
        space.chamberB_RoomId,
      )
      if (!chamberBMembers.some((m) => m.user_id === userMxid)) {
        await this.matrix.inviteUser(space.chamberB_RoomId, userMxid)
      }
      await this.matrix.setPowerLevel(space.chamberB_RoomId, userMxid, -1)
    }

    // Invite to observer room (full participation)
    if (space.observerRoomId) {
      const observerMembers = await this.matrix.getRoomMembers(
        space.observerRoomId,
      )
      if (!observerMembers.some((m) => m.user_id === userMxid)) {
        await this.matrix.inviteUser(space.observerRoomId, userMxid)
      }
      this.log.info(
        { communityUri, userMxid },
        'Invited observer to observer room',
      )
    }
  }

  private async kickFromAllRooms(
    space: any,
    userMxid: string,
    reason: string,
  ): Promise<void> {
    const rooms = [
      space.spaceId,
      space.chamberA_RoomId,
      space.chamberB_RoomId,
      space.observerRoomId,
    ].filter(Boolean)
    for (const roomId of rooms) {
      try {
        await this.matrix.kickUser(
          roomId,
          userMxid,
          `Membership state: ${reason}`,
        )
      } catch (err) {
        // User might not be in this room, ignore
      }
    }
    this.log.info(
      { userMxid, state: reason },
      'Removed user from all community rooms',
    )
  }

  private async ensureUserExists(mxid: string, did: string): Promise<void> {
    const exists = await this.matrix.userExists(mxid)
    if (!exists) {
      const password = crypto.randomUUID()
      await this.matrix.createUser(mxid, did, password)
      this.db.setMxidForDid(did, mxid, password)
      this.log.info({ did, mxid }, 'Created Matrix user')
    }
  }

  private ensureMxid(did: string): string {
    let mxid = this.db.getMxidForDid(did)
    if (!mxid) {
      mxid = didToMxid(did, this.serverName)
      this.db.setMxidForDid(did, mxid, '')
    }
    return mxid
  }
}
