import { sql } from 'kysely'
import {
  type CommunityAuthorityEvent,
  deriveEffectiveAuthority,
} from '@atproto/common'
import type { Database } from './db/index.js'

/*
 * A `com.para.community.governance` record lives in its author's repo, and
 * any account can publish one naming any community. A community therefore
 * shows only the governance record published by its board's creator or by a
 * current owner by verified authority events; one from any other repo is
 * ignored, however recently it was indexed.
 */

export type GovernanceBoard = {
  uri: string
  creator: string
  name: string | null
  slug: string | null
}

const GOVERNANCE_COLLECTION = 'com.para.community.governance'

const COMMUNITY_TRANSLATION_SOURCE =
  'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç'
const COMMUNITY_TRANSLATION_TARGET =
  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'

const normalizeCommunityKey = (value?: string | null) =>
  (value || '')
    .trim()
    .replace(/^p\//i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/** The board's creator and its current owners by verified authority events. */
export const getGovernanceAuthors = async (
  db: Database,
  board: Pick<GovernanceBoard, 'uri' | 'creator'>,
  now = Date.now(),
): Promise<string[]> => {
  const rows = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', board.uri)
    .where('subject', 'in', (qb) =>
      qb
        .selectFrom('para_community_authority_event')
        .where('communityUri', '=', board.uri)
        .where('action', '=', 'owner.grant')
        .select('subject'),
    )
    .selectAll()
    .execute()
  const eventsBySubject = new Map<string, CommunityAuthorityEvent[]>()
  for (const row of rows) {
    const events = eventsBySubject.get(row.subject) ?? []
    events.push({
      uri: row.uri,
      creator: row.creator,
      community: row.communityUri,
      subject: row.subject,
      action: row.action as CommunityAuthorityEvent['action'],
      issuer: row.issuer,
      effectiveAt: row.effectiveAt,
      expiresAt: row.expiresAt,
      predecessor: row.predecessor,
      version: row.version,
      basis: row.basis as CommunityAuthorityEvent['basis'],
      evidence: row.evidence,
    })
    eventsBySubject.set(row.subject, events)
  }
  const authors = new Set([board.creator])
  for (const [subject, events] of eventsBySubject) {
    if (deriveEffectiveAuthority(events, now).roles.includes('owner')) {
      authors.add(subject)
    }
  }
  return [...authors]
}

/**
 * The JSON of the board's published governance record: the latest one by a
 * governance author whose rkey is the board's slug, else whose `community`
 * names the board.
 */
export const getTrustedGovernanceRecordJson = async (
  db: Database,
  board: GovernanceBoard,
): Promise<string | null> => {
  const authors = await getGovernanceAuthors(db, board)

  const slugMatch = await db.db
    .selectFrom('record')
    .select(['json'])
    .where(
      'uri',
      'in',
      authors.map(
        (did) =>
          `at://${did}/${GOVERNANCE_COLLECTION}/${board.slug || 'community'}`,
      ),
    )
    .orderBy('indexedAt', 'desc')
    .executeTakeFirst()
  if (slugMatch) return slugMatch.json

  const normalizedCommunity = normalizeCommunityKey(board.name)
  if (!normalizedCommunity) return null
  const recordMatch = await db.db
    .selectFrom('record')
    .select(['json'])
    .where('did', 'in', authors)
    .where('uri', 'like', `%/${GOVERNANCE_COLLECTION}/%`)
    .where(
      sql`regexp_replace(lower(translate(regexp_replace(coalesce(("record"."json"::jsonb ->> 'community'), ''), '^p/', '', 'i'), ${COMMUNITY_TRANSLATION_SOURCE}, ${COMMUNITY_TRANSLATION_TARGET})), '[^a-z0-9]+', '', 'g')`,
      '=',
      normalizedCommunity,
    )
    .orderBy('indexedAt', 'desc')
    .executeTakeFirst()
  return recordMatch?.json ?? null
}
