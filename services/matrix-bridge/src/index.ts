import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import pino from 'pino'
import { ChatModerationEngine } from './chat-moderation.js'
import { loadConfig } from './config.js'
import { BridgeDatabase } from './db.js'
import {
  computeAssemblySortitionHash,
  fetchBeacon,
  fetchLatestBeacon,
} from './drand.js'
import { extractFromText, persistExtractedCard } from './extraction.js'
import { FirehoseConsumer } from './firehose.js'
import { MatrixSyncPoller } from './matrix-sync.js'
import { authenticateM8, HttpError } from './m8-auth.js'
import { MatrixAdminClient } from './matrix.js'
import { BridgeMetrics } from './metrics.js'
import { OpenAIClient } from './openai-client.js'
import { ProposalEngine } from './proposals.js'
import { RetryWorker } from './retry.js'
import { summarizeCommunityDeliberation } from './summarize.js'

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function writeJson(
  res: import('node:http').ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function sendExpoNotifications({
  tokens,
  title,
  body,
  data,
}: {
  tokens: string[]
  title: string
  body: string
  data: Record<string, unknown>
}) {
  if (tokens.length === 0) return
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }))
  // Expo accepts max 100 messages per request
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Expo push failed: ${res.status} ${text}`)
    }
  }
}

type SortitionRunRow = {
  id: string
  cabildeo_uri: string
  community_uri: string
  created_by_did: string
  assembly_size: number
  eligibility_filter: string
  drand_round: number
  drand_randomness?: string | null
  threshold?: number | null
  eligible_count: number
  selected_count: number
  status: string
  config_record_json?: string | null
  created_at: string
  processed_at?: string | null
}

function formatSortitionRun(row: SortitionRunRow | undefined | null) {
  if (!row) return null
  return {
    id: row.id,
    cabildeoUri: row.cabildeo_uri,
    communityUri: row.community_uri,
    createdByDid: row.created_by_did,
    assemblySize: row.assembly_size,
    eligibilityFilter: row.eligibility_filter,
    drandRound: row.drand_round,
    drandRandomness: row.drand_randomness ?? null,
    threshold: row.threshold ?? null,
    eligibleCount: row.eligible_count,
    selectedCount: row.selected_count,
    status: row.status,
    configRecord: row.config_record_json
      ? JSON.parse(row.config_record_json)
      : null,
    createdAt: row.created_at,
    processedAt: row.processed_at ?? null,
  }
}

function formatSortitionCandidate(row: any) {
  if (!row) return null
  return {
    runId: row.run_id,
    did: row.did,
    communityUri: row.community_uri,
    cabildeoUri: row.cabildeo_uri,
    hashInput: row.hash_input,
    hashOutput: row.hash_output,
    hashValue: row.hash_value,
    threshold: row.threshold,
    selected: row.selected === 1,
    createdAt: row.created_at,
  }
}

async function main() {
  const config = loadConfig()

  const log = pino({
    level: config.logLevel,
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  })

  log.info('Matrix↔PARA Community Bridge starting...')

  const db = new BridgeDatabase(config)
  const matrix = new MatrixAdminClient(config)
  const metrics = new BridgeMetrics()
  const firehose = new FirehoseConsumer(config, db, matrix, metrics, log)
  const chatMod = new ChatModerationEngine(db, log)
  const proposals = new ProposalEngine(db, matrix, log, chatMod)
  const retryWorker = new RetryWorker(db, matrix, metrics, log)
  const syncPoller = new MatrixSyncPoller(config, db, matrix, chatMod, log)

  const processSortitionRun = async (runId: string) => {
    const run = db.getSortitionRun(runId) as SortitionRunRow | undefined
    if (!run) {
      throw new Error('Sortition run not found')
    }
    if (run.status === 'active') {
      return {
        run: formatSortitionRun(run),
        selected: db
          .getSortitionCandidates(run.id, true)
          .map(formatSortitionCandidate),
      }
    }

    const beacon = await fetchBeacon(run.drand_round)
    const allMembers = db.getMemberList(run.community_uri, 10_000, 0)
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
    const eligible = allMembers.filter((member) => {
      if (!member.did) return false
      if (run.eligibility_filter === 'senior') {
        const joinedAt = member.joined_at
          ? new Date(member.joined_at).getTime()
          : 0
        return joinedAt > 0 && joinedAt <= oneYearAgo
      }
      // The bridge does not yet receive a proof-of-personhood signal, so the
      // "verified" filter is recorded in the public config but cannot narrow
      // the local candidate pool until that index exists.
      return true
    })

    if (eligible.length === 0) {
      db.failSortitionRun(run.id)
      throw new Error('No eligible community members found for this sortition')
    }

    const now = new Date().toISOString()
    const ranked = eligible
      .map((member) => {
        const proof = computeAssemblySortitionHash(
          member.did,
          run.community_uri,
          run.cabildeo_uri,
          beacon,
        )
        return {
          did: member.did,
          communityUri: run.community_uri,
          cabildeoUri: run.cabildeo_uri,
          ...proof,
        }
      })
      .sort((a, b) => a.hashValue - b.hashValue)

    const selectedCount = Math.min(run.assembly_size, ranked.length)
    const threshold = ranked[selectedCount - 1]?.hashValue ?? 0
    const candidates = ranked.map((candidate, index) => ({
      ...candidate,
      threshold,
      selected: index < selectedCount,
      createdAt: now,
    }))

    db.replaceSortitionCandidates(run.id, candidates)
    const activated = db.activateSortitionRun({
      id: run.id,
      drandRandomness: beacon.randomness,
      threshold,
      eligibleCount: ranked.length,
      selectedCount,
      processedAt: now,
    }) as SortitionRunRow | undefined

    const selectedDids = candidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => candidate.did)
    const pushTokens = db.getPushTokensByDid(selectedDids)
    await sendExpoNotifications({
      tokens: pushTokens
        .map((token) => token.expoPushToken ?? (token as any).expo_push_token)
        .filter(Boolean),
      title: 'Fuiste seleccionado para una asamblea',
      body: 'Tu prueba criptográfica ya está disponible en PARA.',
      data: {
        type: 'sortition_selected',
        runId: run.id,
        cabildeoUri: run.cabildeo_uri,
        communityUri: run.community_uri,
      },
    })

    log.info(
      {
        runId: run.id,
        cabildeoUri: run.cabildeo_uri,
        eligibleCount: ranked.length,
        selectedCount,
      },
      'Processed Cabildeo sortition run',
    )

    return {
      run: formatSortitionRun(activated),
      selected: db
        .getSortitionCandidates(run.id, true)
        .map(formatSortitionCandidate),
    }
  }

  const processScheduledSortitionRuns = async () => {
    const scheduled = db.getScheduledSortitionRuns(10) as SortitionRunRow[]
    for (const run of scheduled) {
      try {
        await processSortitionRun(run.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!message.includes('drand fetch failed')) {
          log.warn(
            { err, runId: run.id },
            'Scheduled sortition run did not process',
          )
        }
      }
    }
  }

  // Update gauge metrics periodically
  setInterval(() => {
    const userCount = db.getUserCount()
    const spaceCount = db.getSpaceCount()
    metrics.activeUsers.set(userCount)
    metrics.activeSpaces.set(spaceCount)
  }, 60_000)

  setInterval(() => {
    void processScheduledSortitionRuns()
  }, 30_000)

  const gatewayUrl = config.pushGatewayUrl

  // Health check + metrics HTTP server
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/healthz') {
        const failedSyncs = db.getFailedSyncs(5)
        const healthy = failedSyncs.length < 10
        res.writeHead(healthy ? 200 : 503, {
          'Content-Type': 'application/json',
        })
        res.end(
          JSON.stringify({
            status: healthy ? 'ok' : 'degraded',
            failedSyncs: failedSyncs.length,
            recentFailures: failedSyncs.map((f) => ({
              event: f.eventType,
              community: f.communityUri,
              error: f.error,
            })),
          }),
        )
      } else if (req.url === '/metrics') {
        const metricString = await metrics.registry.metrics()
        res.writeHead(200, { 'Content-Type': metrics.registry.contentType })
        res.end(metricString)
      } else if (req.url?.startsWith('/api/space-for-community')) {
        const auth = await authenticateM8(req, config)
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('uri')
        if (!communityUri) {
          writeJson(res, 400, { error: 'Missing uri parameter' })
          return
        }
        if (!db.isActiveCommunityMember(auth.did, communityUri)) {
          writeJson(res, 403, { error: 'Not an active community member' })
          return
        }
        const mapping = db.getSpaceForCommunity(communityUri)
        if (!mapping) {
          writeJson(res, 404, { error: 'Space not found for community' })
          return
        }
        writeJson(res, 200, { spaceId: mapping.spaceId, slug: mapping.slug })
      } else if (req.url === '/api/matrix-token' && req.method === 'POST') {
        const auth = await authenticateM8(req, config)
        const did = auth.did
        const mxid = db.getMxidForDid(did)
        if (!mxid) {
          writeJson(res, 404, { error: 'User not mapped to Matrix' })
          return
        }
        const tokenData = await matrix.generateUserToken(mxid)
        writeJson(res, 200, {
          accessToken: tokenData.accessToken,
          deviceId: tokenData.deviceId,
          userId: mxid,
          homeServer: config.matrixHomeserverUrl
            .replace('http://', 'https://')
            .replace(':8008', ''),
        })
      } else if (req.url === '/api/push-token' && req.method === 'POST') {
        const auth = await authenticateM8(req, config)
        const body = await readBody(req)
        const { expoPushToken, platform } = JSON.parse(body)
        const did = auth.did
        if (!expoPushToken) {
          writeJson(res, 400, { error: 'Missing expoPushToken' })
          return
        }

        db.setPushToken(did, expoPushToken, platform || 'unknown')

        // Register pusher in Synapse so it knows where to send notifications
        const mxid = db.getMxidForDid(did)
        if (mxid) {
          try {
            const tokenData = await matrix.generateUserToken(mxid)
            await matrix.setPusherWithUserToken(
              mxid,
              tokenData.accessToken,
              expoPushToken,
              'com.para.app',
              gatewayUrl,
            )
            log.info({ did, mxid }, 'Registered Matrix pusher')
          } catch (err: any) {
            log.error({ err, did, mxid }, 'Failed to register Matrix pusher')
            // Don't fail the request — token is saved, pusher can be retried
          }
        }

        writeJson(res, 200, { ok: true })
      } else if (
        req.url === '/_matrix/push/v1/notify' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const payload = JSON.parse(body)
        const notification = payload.notification

        if (!notification) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing notification' }))
          return
        }

        const roomId = notification.room_id as string
        const devices = (notification.devices || []) as Array<{
          app_id: string
          pushkey: string
          pushkey_ts?: number
        }>

        // Find community info for deep linking
        const community = db.getCommunityByRoomId(roomId)
        const senderMxid = notification.sender as string | undefined
        // Build Expo data payload for deep linking
        const expoData: Record<string, unknown> = {
          reason: 'matrix-message',
          roomId,
          communityUri: community?.communityUri || '',
          communityName: community?.slug || 'Comunidad',
          senderName: senderMxid?.split(':')[0]?.replace('@', '') || 'Alguien',
        }

        const pushTokens = devices
          .map((d) => d.pushkey)
          .filter((k) => k && k.startsWith('ExponentPushToken'))

        if (pushTokens.length > 0) {
          try {
            await sendExpoNotifications({
              tokens: pushTokens,
              title: community?.slug || 'PARA Chat',
              body: `Nuevo mensaje en ${community?.slug || 'tu comunidad'}`,
              data: expoData,
            })
            log.debug(
              { roomId, tokens: pushTokens.length },
              'Sent push notification',
            )
          } catch (err: any) {
            log.error({ err, roomId }, 'Failed to send push notification')
          }
        }

        // Respond as Matrix Push Gateway spec requires
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ rejected: [] }))
      } else if (req.url === '/api/mark-read' && req.method === 'POST') {
        const auth = await authenticateM8(req, config)
        const body = await readBody(req)
        const { roomId, eventId } = JSON.parse(body)
        const did = auth.did
        if (!roomId) {
          writeJson(res, 400, { error: 'Missing roomId' })
          return
        }
        const community = db.getCommunityByRoomId(roomId)
        if (
          !community ||
          !db.isActiveCommunityMember(did, community.communityUri)
        ) {
          writeJson(res, 403, { error: 'Not an active community member' })
          return
        }
        // If no eventId provided, mark all current events as read
        const targetEventId =
          eventId ||
          (() => {
            const events = db.getRecentEvents(roomId, 1)
            return events[0]?.event_id
          })()
        if (targetEventId) {
          db.setReadMarker(did, roomId, targetEventId)
        }
        writeJson(res, 200, { ok: true })
      } else if (req.url?.startsWith('/api/unread') && req.method === 'GET') {
        const auth = await authenticateM8(req, config)
        const did = auth.did
        const communities = db.getUnreadCountsForDid(did)
        const total = communities.reduce((sum, c) => sum + c.unread, 0)
        writeJson(res, 200, { unread: total, communities })
      } else if (req.url === '/api/sortition/runs' && req.method === 'POST') {
        const body = await readBody(req)
        const {
          cabildeoUri,
          communityUri,
          createdByDid,
          assemblySize = 100,
          eligibilityFilter = 'all',
          drandRound,
          roundOffset = 20,
        } = JSON.parse(body)
        if (!cabildeoUri || !communityUri || !createdByDid) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Missing cabildeoUri, communityUri, or createdByDid',
            }),
          )
          return
        }
        const existing = db.getSortitionRunByCabildeo(cabildeoUri)
        if (existing) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Sortition already configured for this Cabildeo',
              run: formatSortitionRun(existing),
            }),
          )
          return
        }
        const size = Number(assemblySize)
        if (![50, 100, 500].includes(size)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Assembly size must be 50, 100, or 500' }),
          )
          return
        }
        const filter = ['all', 'verified', 'senior'].includes(eligibilityFilter)
          ? eligibilityFilter
          : 'all'
        const latest = Number(drandRound) > 0 ? null : await fetchLatestBeacon()
        const targetRound =
          Number(drandRound) > 0
            ? Number(drandRound)
            : (latest?.round ?? 0) + Math.max(1, Number(roundOffset) || 20)
        const now = new Date().toISOString()
        const configRecord = {
          $type: 'com.para.governance.sortitionConfig',
          cabildeo: cabildeoUri,
          community: communityUri,
          createdBy: createdByDid,
          assemblySize: size,
          eligibilityFilter: filter,
          drandRound: targetRound,
          createdAt: now,
        }
        const run = db.createSortitionRun({
          id: randomUUID(),
          cabildeoUri,
          communityUri,
          createdByDid,
          assemblySize: size,
          eligibilityFilter: filter,
          drandRound: targetRound,
          configRecordJson: JSON.stringify(configRecord),
          createdAt: now,
        })
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ run: formatSortitionRun(run) }))
      } else if (
        req.url?.startsWith('/api/sortition/runs') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const cabildeoUri = url.searchParams.get('cabildeo')
        const viewerDid = url.searchParams.get('viewerDid')
        if (!cabildeoUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing cabildeo parameter' }))
          return
        }
        const run = db.getSortitionRunByCabildeo(cabildeoUri) as
          | SortitionRunRow
          | undefined
        if (!run) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Sortition run not found' }))
          return
        }
        const selected = db
          .getSortitionCandidates(run.id, true)
          .map(formatSortitionCandidate)
        const viewerCandidate = viewerDid
          ? formatSortitionCandidate(
              db.getSortitionCandidate(run.id, viewerDid),
            )
          : null
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            run: formatSortitionRun(run),
            selected,
            viewerCandidate,
          }),
        )
      } else if (
        req.url === '/api/sortition/runs/process' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const { runId } = JSON.parse(body)
        if (!runId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing runId' }))
          return
        }
        const result = await processSortitionRun(runId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } else if (
        req.url?.startsWith('/api/sortition-proofs') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const proofs = db.getSortitionProofsByCommunity(communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ proofs }))
      } else if (
        req.url?.startsWith('/api/sortition-proof') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const did = url.searchParams.get('did')
        const communityUri = url.searchParams.get('community')
        if (!did || !communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Missing did or community parameter' }),
          )
          return
        }
        const proof = db.getSortitionProof(did, communityUri)
        if (!proof) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Sortition proof not found' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            did: proof.did,
            communityUri: proof.community_uri,
            chamber: proof.chamber,
            drandRound: proof.drand_round,
            drandRandomness: proof.drand_randomness,
            hashInput: proof.hash_input,
            hashOutput: proof.hash_output,
            timestamp: proof.timestamp,
            verified: proof.verified === 1,
          }),
        )
      } else if (req.url === '/api/verify-sortition' && req.method === 'POST') {
        const body = await readBody(req)
        const { did, communityUri, round, randomness } = JSON.parse(body)
        if (!did || !communityUri || !round || !randomness) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing required fields' }))
          return
        }
        const stored = db.getSortitionProof(did, communityUri)
        if (!stored) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No stored proof found' }))
          return
        }
        const matches =
          stored.drand_round === round &&
          stored.drand_randomness === randomness &&
          stored.verified === 1
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            valid: matches,
            storedRound: stored.drand_round,
            providedRound: round,
            chamber: stored.chamber,
          }),
        )
      } else if (
        req.url?.startsWith('/api/sortition-proof-as-record') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const did = url.searchParams.get('did')
        const communityUri = url.searchParams.get('community')
        if (!did || !communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Missing did or community parameter' }),
          )
          return
        }
        const stored = db.getSortitionProof(did, communityUri)
        if (!stored) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Sortition proof not found' }))
          return
        }
        // Return the proof as a ready-to-publish AT Protocol record
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            $type: 'com.para.sortition.proof',
            did: stored.did,
            community: stored.community_uri,
            chamber: stored.chamber,
            drandRound: stored.drand_round,
            drandRandomness: stored.drand_randomness,
            hashInput: stored.hash_input,
            hashOutput: stored.hash_output,
            threshold: stored.threshold,
            timestamp: stored.timestamp,
            // Usage: POST to your PDS at /xrpc/com.atproto.repo.createRecord
            // with collection: 'com.para.sortition.proof' and this object as record
          }),
        )
      } else if (
        req.url?.startsWith('/api/constitution') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('uri')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing uri parameter' }))
          return
        }
        const row = db.getConstitution(communityUri)
        if (!row) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Constitution not found' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            communityUri: row.communityUri,
            version: row.version,
            rules: JSON.parse(row.rulesJson),
            createdAt: row.createdAt,
          }),
        )
      } else if (
        req.url?.startsWith('/api/proposals') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        const state = url.searchParams.get('state') || undefined
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const items = db.getProposalsByCommunity(communityUri, state)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ proposals: items }))
      } else if (
        req.url?.startsWith('/api/decisions') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const items = db.getDecisionsByCommunity(communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ decisions: items }))
      } else if (
        req.url?.startsWith('/api/chat-badges') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const did = url.searchParams.get('did')
        const communityUri = url.searchParams.get('community')
        if (!did || !communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Missing did or community parameter' }),
          )
          return
        }
        const badges = chatMod.recomputeUser(did, communityUri)
        const visibleBadges = badges.filter((b) => b.visibleInChat)
        const hiddenBadges = badges.filter((b) => !b.visibleInChat)
        const participation = chatMod.getParticipationSummary(did, communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            did,
            communityUri,
            visibleBadges,
            hiddenBadges,
            participation,
          }),
        )
      } else if (
        req.url?.startsWith('/api/chat-member-list') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const limit = parseInt(url.searchParams.get('limit') || '100', 10)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)
        const members = chatMod.getMemberList(communityUri, limit, offset)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ members, total: members.length }))
      } else if (
        req.url === '/api/moderation-report' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const {
          reportedDid,
          reporterDid,
          communityUri,
          reason,
          context,
          matrixEventId,
          matrixRoomId,
        } = JSON.parse(body)
        if (!reportedDid || !reporterDid || !communityUri || !reason) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing required fields' }))
          return
        }
        // Verify both are members
        const reporterStats = db.getParticipationStats(
          reporterDid,
          communityUri,
        )
        if (!reporterStats) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Reporter is not a community member' }),
          )
          return
        }
        chatMod.ingestReport({
          reportedDid,
          reporterDid,
          communityUri,
          reason,
          context,
          matrixEventId,
          matrixRoomId,
        })
        chatMod.recomputeUser(reportedDid, communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else if (
        req.url === '/api/moderation-sanction' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const {
          targetDid,
          sanctionedByDid,
          communityUri,
          type,
          durationMinutes,
          matrixRoomId,
        } = JSON.parse(body)
        if (!targetDid || !sanctionedByDid || !communityUri || !type) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing required fields' }))
          return
        }
        // Verify sanctionedBy is moderator
        const modStats = db.getParticipationStats(sanctionedByDid, communityUri)
        if (!modStats || !modStats.is_moderator) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Only moderators can apply sanctions' }),
          )
          return
        }
        chatMod.ingestSanction({
          targetDid,
          communityUri,
          sanctionType: type,
          durationMinutes,
          sanctionedByDid,
          matrixRoomId,
        })
        chatMod.recomputeUser(targetDid, communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else if (
        req.url?.startsWith('/api/moderation-dashboard') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        const modDid = url.searchParams.get('modDid')
        if (!communityUri || !modDid) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Missing community or modDid parameter' }),
          )
          return
        }
        const modStats = db.getParticipationStats(modDid, communityUri)
        if (!modStats || !modStats.is_moderator) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Only moderators can view dashboard' }),
          )
          return
        }
        const dashboard = chatMod.getDashboard(communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(dashboard))
      } else if (
        req.url === '/api/moderation-recompute' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const { communityUri } = JSON.parse(body)
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing communityUri' }))
          return
        }
        const count = chatMod.recomputeCommunity(communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ recomputed: count }))
      } else if (
        req.url?.startsWith('/api/user-chat-preferences') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const did = url.searchParams.get('did')
        if (!did) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing did parameter' }))
          return
        }
        const prefs = db.getChatPreferences(did)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(prefs))
      } else if (
        req.url === '/api/user-chat-preferences' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const { did, showChatBadges } = JSON.parse(body)
        if (!did || typeof showChatBadges !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing did or showChatBadges' }))
          return
        }
        db.setChatPreferences(did, showChatBadges)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))

        // ── Deliberation / Knowledge Graph API ──
      } else if (req.url === '/api/cards' && req.method === 'POST') {
        const body = await readBody(req)
        const {
          communityUri,
          authorDid,
          title,
          content,
          cardType,
          sourceUrl,
          isPublic,
          passportVisible,
          metadata,
        } = JSON.parse(body)
        if (!communityUri || !authorDid || !title) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Missing communityUri, authorDid, or title',
            }),
          )
          return
        }
        const id = crypto.randomUUID()
        db.insertCard({
          id,
          communityUri,
          authorDid,
          title,
          content,
          cardType: cardType || 'claim',
          sourceUrl,
          isPublic: isPublic ? 1 : 0,
          passportVisible: passportVisible ? 1 : 0,
          metadata,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id }))
      } else if (req.url?.startsWith('/api/cards') && req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const cards = db.getCardsForCommunity(communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ cards }))
      } else if (
        (req.url === '/api/community-tree/contributions' ||
          req.url === '/api/community-map/contributions') &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const {
          communityUri,
          authorDid,
          title,
          content,
          sourceUrl,
          sourceType,
          metadata,
        } = JSON.parse(body)
        if (!communityUri || !authorDid || !title || !sourceType) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Missing communityUri, authorDid, title, or sourceType',
            }),
          )
          return
        }
        const id = crypto.randomUUID()
        db.insertCommunityMapContribution({
          id,
          communityUri,
          authorDid,
          title,
          content,
          sourceUrl,
          sourceType,
          metadata,
        })
        const contribution = db.getCommunityMapContribution(id, authorDid)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ contribution }))
      } else if (
        (req.url?.startsWith('/api/community-tree/contributions') ||
          req.url?.startsWith('/api/community-map/contributions')) &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        const status = url.searchParams.get('status') || 'pending'
        const viewerDid = url.searchParams.get('viewer') || undefined
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const contributions = db.getCommunityMapContributions(communityUri, {
          status,
          viewerDid,
          limit: 50,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ contributions }))
      } else if (
        (req.url === '/api/community-tree/contributions/vote' ||
          req.url === '/api/community-map/contributions/vote') &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const { contributionId, voterDid, vote } = JSON.parse(body)
        if (
          !contributionId ||
          !voterDid ||
          !['approve', 'reject'].includes(vote)
        ) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Missing contributionId, voterDid, or valid vote',
            }),
          )
          return
        }
        const contribution = db.voteCommunityMapContribution(
          contributionId,
          voterDid,
          vote,
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ contribution }))
      } else if (req.url === '/api/relationships' && req.method === 'POST') {
        const body = await readBody(req)
        const { sourceCardId, targetCardId, relationshipType, authorDid } =
          JSON.parse(body)
        if (!sourceCardId || !targetCardId || !relationshipType || !authorDid) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing required fields' }))
          return
        }
        const validTypes = [
          'supports',
          'opposes',
          'addresses',
          'helpful',
          'explainer',
          'compares_to',
        ]
        if (!validTypes.includes(relationshipType)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: `Invalid relationshipType. Must be one of: ${validTypes.join(', ')}`,
            }),
          )
          return
        }
        const id = crypto.randomUUID()
        db.insertRelationship({
          id,
          sourceCardId,
          targetCardId,
          relationshipType,
          authorDid,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id }))
      } else if (req.url?.startsWith('/api/graph') && req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const graph = db.getGraphForCommunity(communityUri)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(graph))
      } else if (
        req.url?.startsWith('/api/suggestions') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        const status = url.searchParams.get('status') || 'pending'
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const suggestions = db.getSuggestionsForCommunity(communityUri, {
          status,
          limit: 50,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ suggestions }))
      } else if (
        req.url === '/api/suggestions/accept' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const { id, authorDid } = JSON.parse(body)
        if (!id || !authorDid) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing id or authorDid' }))
          return
        }
        db.acceptSuggestion(id, authorDid)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } else if (
        req.url === '/api/suggestions/reject' &&
        req.method === 'POST'
      ) {
        const body = await readBody(req)
        const { id } = JSON.parse(body)
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing id' }))
          return
        }
        db.rejectSuggestion(id)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } else if (
        req.url?.startsWith('/api/summarize') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        if (!config.openaiApiKey) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'LLM summarization not configured' }))
          return
        }
        const client = new OpenAIClient(
          config.openaiApiKey,
          config.openaiModel || 'gpt-4o-mini',
        )
        const summary = await summarizeCommunityDeliberation(
          client,
          db,
          communityUri,
        )
        if (!summary) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Not enough claims to summarize' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(summary))
      } else if (req.url === '/api/vote' && req.method === 'POST') {
        const body = await readBody(req)
        const { cardId, voterDid, influence } = JSON.parse(body)
        if (!cardId || !voterDid || typeof influence !== 'number') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Missing cardId, voterDid, or influence' }),
          )
          return
        }
        if (influence < -3 || influence > 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Influence must be between -3 and +3' }),
          )
          return
        }
        db.upsertCardVote(cardId, voterDid, influence)
        const votes = db.getCardVotes(cardId)
        const totalInfluence = votes.reduce(
          (sum: number, v: { influence: number }) => sum + v.influence,
          0,
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            totalInfluence,
            voteCount: votes.length,
          }),
        )
      } else if (req.url?.startsWith('/api/votes') && req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const cardId = url.searchParams.get('card')
        if (!cardId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing card parameter' }))
          return
        }
        const voterDid = url.searchParams.get('voter')
        if (voterDid) {
          const vote = db.getCardVote(cardId, voterDid)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ vote: vote ?? null }))
        } else {
          const votes = db.getCardVotes(cardId)
          const totalInfluence = votes.reduce(
            (sum: number, v: { influence: number }) => sum + v.influence,
            0,
          )
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ votes, totalInfluence, voteCount: votes.length }),
          )
        }
      } else if (
        req.url?.startsWith('/api/community-pulse') &&
        req.method === 'GET'
      ) {
        const url = new URL(req.url, `http://localhost:${config.port}`)
        const communityUri = url.searchParams.get('community')
        const voterDid = url.searchParams.get('voter') || undefined
        if (!communityUri) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing community parameter' }))
          return
        }
        const pulse = db.getCommunityPulse(communityUri, voterDid)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(pulse))
      } else if (req.url === '/api/extract' && req.method === 'POST') {
        const body = await readBody(req)
        const { text, communityUri, authorDid } = JSON.parse(body)
        if (!text || !communityUri || !authorDid) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'Missing text, communityUri, or authorDid',
            }),
          )
          return
        }
        const extracted = extractFromText(text, { communityUri })
        if (extracted) {
          persistExtractedCard(db, extracted, { communityUri, authorDid })
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ extracted }))
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    } catch (err: any) {
      log.error({ err, url: req.url }, 'HTTP handler error')
      if (!res.headersSent) {
        if (err instanceof HttpError) {
          writeJson(res, err.statusCode, { error: err.message })
        } else {
          writeJson(res, 500, { error: err.message })
        }
      }
    }
  })

  server.listen(config.port, () => {
    log.info({ port: config.port }, 'Bridge server listening')
  })

  // Start workers
  retryWorker.start()
  syncPoller.start()
  await firehose.start()

  // Proposal state machine — runs every 10 minutes to enforce constitution
  const proposalCron = setInterval(() => {
    proposals.processStateTransitions().catch((err: any) => {
      log.error({ err }, 'Proposal state transition error')
    })
  }, 600_000)

  // Badge recompute + expiry — runs every 5 minutes
  const badgeCron = setInterval(() => {
    chatMod.runExpiry()
    // TODO: batch recompute for communities with recent activity
  }, 300_000)

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...')
    retryWorker.stop()
    syncPoller.stop()
    firehose.stop()
    clearInterval(proposalCron)
    clearInterval(badgeCron)
    server.close()
    db.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
