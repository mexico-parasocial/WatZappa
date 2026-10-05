import { type Expression, sql } from 'kysely'
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
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/** `normalizeCommunityKey` in SQL, up to the accents in the translation table. */
const normalizedCommunityKeySql = (value: Expression<unknown>) =>
  sql<string>`regexp_replace(lower(translate(regexp_replace(coalesce(${value}, ''), '^p/', '', 'i'), ${COMMUNITY_TRANSLATION_SOURCE}, ${COMMUNITY_TRANSLATION_TARGET})), '[^a-z0-9]+', '', 'g')`

/** An authority event that applies now: effective, and not expired. */
const appliesNow = (alias: string) =>
  sql.raw(
    `${alias}."effectiveAt"::timestamptz <= now() and (${alias}."expiresAt" is null or ${alias}."expiresAt"::timestamptz > now())`,
  )

/**
 * The SQL twin of `deriveEffectiveAuthority(events).roles.includes('owner')`:
 * `did` holds an owner grant that applies now, was made while an active
 * member, and has not since been ended by a revocation, suspension, removal
 * or block.
 */
export const isCommunityOwnerSql = (
  community: Expression<unknown>,
  did: Expression<unknown>,
) => sql<boolean>`exists (
  select 1 from para_community_authority_event granted
  where granted."communityUri" = ${community}
    and granted.subject = ${did}
    and granted.action = 'owner.grant'
    and ${appliesNow('granted')}
    and not exists (
      select 1 from para_community_authority_event ended
      where ended."communityUri" = granted."communityUri"
        and ended.subject = granted.subject
        and ended.action in ('owner.revoke', 'member.suspend', 'member.remove', 'member.block')
        and ended.version > granted.version
        and ${appliesNow('ended')}
    )
    and exists (
      select 1 from para_community_authority_event joined
      where joined."communityUri" = granted."communityUri"
        and joined.subject = granted.subject
        and joined.action in ('member.activate', 'member.reinstate')
        and joined.version < granted.version
        and ${appliesNow('joined')}
        and not exists (
          select 1 from para_community_authority_event cleared
          where cleared."communityUri" = granted."communityUri"
            and cleared.subject = granted.subject
            and cleared.action in ('member.suspend', 'member.remove', 'member.block')
            and cleared.version > joined.version
            and cleared.version < granted.version
            and ${appliesNow('cleared')}
        )
    )
)`

/**
 * For a `para_community_governance` row (`row`) and a `para_community_board`
 * row (`board`): the row's record is one `getTrustedGovernanceRecordJson`
 * would return for the board, by a governance author and under the board's
 * slug or name. Order matches with `governanceSlugMatchSql` first, then by
 * `indexedAt`, to pick the same record.
 */
export const isTrustedBoardGovernanceSql = (row: string, board: string) => {
  const author = sql`split_part(${sql.ref(`${row}.uri`)}, '/', 3)`
  const boardName = normalizedCommunityKeySql(sql.ref(`${board}.name`))
  return sql<boolean>`(
    (${author} = ${sql.ref(`${board}.creator`)}
      or ${isCommunityOwnerSql(sql.ref(`${board}.uri`), author)})
    and (
      ${governanceSlugMatchSql(row, board)}
      or (${boardName} <> '' and ${normalizedCommunityKeySql(sql.ref(`${row}.communityUri`))} = ${boardName})
    )
  )`
}

/** The governance row's rkey is the board's slug. */
export const governanceSlugMatchSql = (row: string, board: string) =>
  sql<boolean>`split_part(${sql.ref(`${row}.uri`)}, '/', 5) = coalesce(nullif(${sql.ref(`${board}.slug`)}, ''), 'community')`

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
      normalizedCommunityKeySql(sql`"record"."json"::jsonb ->> 'community'`),
      '=',
      normalizedCommunity,
    )
    .orderBy('indexedAt', 'desc')
    .executeTakeFirst()
  return recordMatch?.json ?? null
}
