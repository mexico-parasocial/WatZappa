import { Selectable, sql } from 'kysely'
import { Database } from './db/index.js'
import { CabildeoLivePresence, CabildeoLiveSession } from './db/tables/cabildeo.js'

export const LIVE_CABILDEO_ALLOWED_PHASES = [
  'open',
  'deliberating',
  'voting',
] as const

export const LIVE_CABILDEO_PRESENCE_TTL_MS = 90 * 1000

export type LiveSessionSummary = {
  isLive: boolean
  hostDid: string
  activeParticipantCount: number
  startedAt: string
  participantPreviewDids: string[]
}

export type ActorCabildeoLive = {
  cabildeoUri: string
  community: string
  phase: string
  expiresAt: string
  liveUri: string
}

export const activeHostPresenceExistsSql = (
  sessionAlias: string,
  now: string | Date,
) => sql<boolean>`exists (
  select 1
  from cabildeo_live_presence as host_presence
  where ${sql.id('host_presence', 'cabildeo')} = ${sql.id(
    sessionAlias,
    'cabildeo',
  )}
    and ${sql.id('host_presence', 'actorDid')} = ${sql.id(
      sessionAlias,
      'hostDid',
    )}
    and ${sql.id('host_presence', 'expiresAt')} > ${toDbTimestamp(now)}
)`

export const getActiveLiveSession = async (
  db: Database,
  cabildeoUri: string,
  now: string | Date,
): Promise<Selectable<CabildeoLiveSession> | undefined> => {
  return db.db
    .selectFrom('cabildeo_live_session')
    .where('cabildeo', '=', cabildeoUri)
    .where('endedAt', 'is', null)
    .where(activeHostPresenceExistsSql('cabildeo_live_session', now))
    .selectAll()
    .executeTakeFirst()
}

export const getLiveSessionSummary = async (
  db: Database,
  cabildeoUri: string,
  now: string | Date,
): Promise<LiveSessionSummary | undefined> => {
  const session = await getActiveLiveSession(db, cabildeoUri, now)
  if (!session) return undefined

  const participantRows = await db.db
    .selectFrom('cabildeo_live_presence')
    .where('cabildeo', '=', cabildeoUri)
    .where(
      sql<boolean>`"cabildeo_live_presence"."expiresAt" > ${toDbTimestamp(now)}`,
    )
    .select(['actorDid', 'expiresAt'])
    .orderBy('expiresAt', 'desc')
    .execute()

  const seen = new Set<string>()
  const participantPreviewDids: string[] = []
  for (const row of participantRows) {
    if (seen.has(row.actorDid)) continue
    seen.add(row.actorDid)
    if (participantPreviewDids.length < 5) {
      participantPreviewDids.push(row.actorDid)
    }
  }

  return {
    isLive: true,
    hostDid: session.hostDid,
    activeParticipantCount: seen.size,
    startedAt: session.startedAt,
    participantPreviewDids,
  }
}

export const mapActorCabildeoLive = (row: {
  cabildeo: string
  community: string
  phase: string
  expiresAt: string
  liveUri: string
}): ActorCabildeoLive => ({
  cabildeoUri: row.cabildeo,
  community: row.community,
  phase: row.phase,
  expiresAt: row.expiresAt,
  liveUri: row.liveUri,
})

export const presenceExpiry = (now = Date.now()) =>
  new Date(now + LIVE_CABILDEO_PRESENCE_TTL_MS).toISOString()

export const isLiveCabildeoPhase = (phase?: string | null): boolean =>
  !!phase && LIVE_CABILDEO_ALLOWED_PHASES.includes(phase as any)

export type LivePresenceRow = Selectable<CabildeoLivePresence>

const toDbTimestamp = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value)
