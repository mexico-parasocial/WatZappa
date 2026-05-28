// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
// eslint-disable-next-line import/no-unresolved
import { ParaCacheService } from '../../../cache/para-cache.js'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

interface VoteRecord {
  subject?: string
  subjectType?: string
  cabildeo?: string
  selectedOption?: number
  signal?: number
  reason?: string
  isDirect: boolean
  delegatedFrom?: string[]
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type CabildeoVote = Selectable<DatabaseSchemaType['cabildeo_vote']>
type ParaPolicyVote = Selectable<DatabaseSchemaType['para_policy_vote']>
type IndexedVote = {
  cabildeoRecord?: CabildeoVote
  policyRecord?: ParaPolicyVote
}

const lexId = 'com.para.civic.vote'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: VoteRecord,
  timestamp: string,
): Promise<IndexedVote | null> => {
  if (
    obj.subjectType === 'policy' &&
    obj.subject &&
    typeof obj.signal === 'number'
  ) {
    const record = {
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      subject: obj.subject,
      subjectType: obj.subjectType,
      signal: obj.signal,
      isDirect: obj.isDirect ? (1 as const) : (0 as const),
      delegatedFrom: obj.delegatedFrom?.length
        ? sql<string[]>`${JSON.stringify(obj.delegatedFrom)}`
        : null,
      voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
      eligibilityProofRef: normalizeOpaqueProofField(obj.eligibilityProofRef, 512),
      reason: obj.reason ?? null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    }

    const existingByNullifier = record.voteNullifier
      ? await db
          .selectFrom('para_policy_vote')
          .where('subjectType', '=', record.subjectType)
          .where('subject', '=', record.subject)
          .where('voteNullifier', '=', record.voteNullifier)
          .select(['uri'])
          .executeTakeFirst()
      : null

    const inserted = existingByNullifier
      ? await db
          .updateTable('para_policy_vote')
          .set(record)
          .where('uri', '=', existingByNullifier.uri)
          .returningAll()
          .executeTakeFirst()
      : await db
          .insertInto('para_policy_vote')
          .values(record)
          .onConflict((oc) =>
            oc.columns(['creator', 'subjectType', 'subject']).doUpdateSet({
              uri: record.uri,
              cid: record.cid,
              signal: record.signal,
              isDirect: record.isDirect,
              delegatedFrom: record.delegatedFrom,
              voteNullifier: record.voteNullifier,
              eligibilityProofRef: record.eligibilityProofRef,
              reason: record.reason,
              createdAt: record.createdAt,
              indexedAt: record.indexedAt,
            }),
          )
          .returningAll()
          .executeTakeFirst()

    return inserted ? { policyRecord: inserted } : null
  }

  if (!obj.cabildeo) {
    return null
  }
  if (
    typeof obj.selectedOption !== 'number' ||
    !Number.isInteger(obj.selectedOption)
  ) {
    return null
  }

  const eligibility = await getCabildeoVoteEligibility(db, {
    actorDid: uri.host,
    cabildeoUri: obj.cabildeo,
    selectedOption: obj.selectedOption,
    indexedAt: timestamp,
  })
  if (!eligibility) {
    return null
  }

  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    cabildeo: obj.cabildeo,
    selectedOption: obj.selectedOption ?? null,
    isDirect: obj.isDirect ? (1 as const) : (0 as const),
    delegatedFrom: obj.delegatedFrom?.length
      ? sql<string[]>`${JSON.stringify(obj.delegatedFrom)}`
      : null,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(obj.eligibilityProofRef, 512),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const existingByNullifier = record.voteNullifier
    ? await db
        .selectFrom('cabildeo_vote')
        .where('cabildeo', '=', record.cabildeo)
        .where('voteNullifier', '=', record.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : null

  const inserted = existingByNullifier
    ? await db
        .updateTable('cabildeo_vote')
        .set(record)
        .where('uri', '=', existingByNullifier.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('cabildeo_vote')
        .values(record)
        .onConflict((oc) =>
          oc.columns(['creator', 'cabildeo']).doUpdateSet({
            uri: record.uri,
            cid: record.cid,
            selectedOption: record.selectedOption,
            isDirect: record.isDirect,
            delegatedFrom: record.delegatedFrom,
            voteNullifier: record.voteNullifier,
            eligibilityProofRef: record.eligibilityProofRef,
            createdAt: record.createdAt,
            indexedAt: record.indexedAt,
          }),
        )
        .returningAll()
        .executeTakeFirst()

  if (!inserted) {
    return null
  }

  return { cabildeoRecord: inserted }
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const getCabildeoVoteEligibility = async (
  db: DatabaseSchema,
  opts: {
    actorDid: string
    cabildeoUri: string
    selectedOption: number
    indexedAt: string
  },
) => {
  const cabildeo = await db
    .selectFrom('cabildeo_cabildeo')
    .where('uri', '=', opts.cabildeoUri)
    .select(['uri', 'community', 'options', 'phase', 'phaseDeadline'])
    .executeTakeFirst()

  if (!cabildeo || !['voting', 'resolved'].includes(cabildeo.phase)) {
    return null
  }
  if (
    cabildeo.phaseDeadline &&
    new Date(cabildeo.phaseDeadline) <= new Date(opts.indexedAt)
  ) {
    return null
  }

  const options = Array.isArray(cabildeo.options) ? cabildeo.options : []
  if (opts.selectedOption < 0 || opts.selectedOption >= options.length) {
    return null
  }

  const community = normalizeCommunitySlug(cabildeo.community)
  const board = await db
    .selectFrom('para_community_board')
    .where((qb) =>
      qb
        .where('uri', '=', cabildeo.community)
        .orWhere('slug', '=', community)
        .orWhere(
          sql`regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]+', '-', 'g')`,
          '=',
          community,
        ),
    )
    .select(['uri'])
    .executeTakeFirst()

  if (!board) {
    return null
  }

  const membership = await db
    .selectFrom('para_community_membership')
    .where('creator', '=', opts.actorDid)
    .where('communityUri', '=', board.uri)
    .where('membershipState', '=', 'active')
    .select(['uri'])
    .executeTakeFirst()

  return membership ? { cabildeo } : null
}

const normalizeCommunitySlug = (value: string) =>
  value
    .replace(/^p\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

const notifsForInsert = () => {
  return []
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedVote | null> => {
  const deletedPolicy = await db
    .deleteFrom('para_policy_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  if (deletedPolicy) {
    return { policyRecord: deletedPolicy }
  }

  const deletedCabildeo = await db
    .deleteFrom('cabildeo_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deletedCabildeo ? { cabildeoRecord: deletedCabildeo } : null
}

const notifsForDelete = (
  deleted: IndexedVote,
  _replacedBy: IndexedVote | null,
) => {
  const uri = deleted.policyRecord?.uri || deleted.cabildeoRecord?.uri
  return { notifs: [], toDelete: uri ? [uri] : [] }
}

const updateAggregates = async (db: DatabaseSchema, indexed: IndexedVote) => {
  if (indexed.cabildeoRecord) {
    await recomputeCabildeoAggregates(db, indexed.cabildeoRecord.cabildeo)
  }
}

const invalidateCache = async (
  db: DatabaseSchema,
  indexed: IndexedVote,
): Promise<string[]> => {
  const keys: string[] = []
  const vote = indexed.cabildeoRecord || indexed.policyRecord
  if (!vote) return keys

  // Invalidate profile stats for the voter
  keys.push(`profileStats:${vote.creator}`)

  // If cabildeo vote, invalidate members cache for the community
  if (indexed.cabildeoRecord) {
    const cabildeo = await db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', indexed.cabildeoRecord.cabildeo)
      .select('community')
      .executeTakeFirst()
    if (cabildeo?.community) {
      keys.push(`members:${cabildeo.community}:*`)
    }
  }

  return keys
}

export type PluginType = RecordProcessor<VoteRecord, IndexedVote>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
  paraCache?: ParaCacheService,
): PluginType => {
  return new RecordProcessor(
    db,
    background,
    {
      lexId,
      insertFn,
      findDuplicate,
      deleteFn,
      notifsForInsert,
      notifsForDelete,
      updateAggregates,
      invalidateCache: paraCache ? invalidateCache : undefined,
    },
    paraCache,
  )
}

export default makePlugin
