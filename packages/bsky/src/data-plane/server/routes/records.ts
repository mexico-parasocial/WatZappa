import { Timestamp } from '@bufbuild/protobuf'
import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import * as ui8 from 'uint8arrays'
import { keyBy } from '@atproto/common'
import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { app, chat, com } from '../../../lexicons/index.js'
import { Service } from '../../../proto/bsky_connect.js'
import {
  ParaPolicySignalBucket,
  ParaPolicyTally,
  ParaPostMeta,
  PostRecordMeta,
  Record,
} from '../../../proto/bsky_pb.js'
import { Database } from '../db/index.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  getBlockRecords: getRecords(db, app.bsky.graph.block),
  getFeedGeneratorRecords: getRecords(db, app.bsky.feed.generator),
  getFollowRecords: getRecords(db, app.bsky.graph.follow),
  getLikeRecords: getRecords(db, app.bsky.feed.like),
  getListBlockRecords: getRecords(db, app.bsky.graph.listblock),
  getListItemRecords: getRecords(db, app.bsky.graph.listitem),
  getListRecords: getRecords(db, app.bsky.graph.list),
  getPostRecords: getPostRecords(db),
  getProfileRecords: getRecords(db, app.bsky.actor.profile),
  getRepostRecords: getRecords(db, app.bsky.feed.repost),
  getThreadGateRecords: getRecords(db, app.bsky.feed.threadgate),
  getPostgateRecords: getRecords(db, app.bsky.feed.postgate),
  getLabelerRecords: getRecords(db, app.bsky.labeler.service),
  getActorChatDeclarationRecords: getRecords(db, chat.bsky.actor.declaration),
  getNotificationDeclarationRecords: getRecords(
    db,
    app.bsky.notification.declaration,
  ),
  getGermDeclarationRecords: getRecords(db, com.germnetwork.declaration),
  getStarterPackRecords: getRecords(db, app.bsky.graph.starterpack),
  getVerificationRecords: getRecords(db, app.bsky.graph.verification),
  getStatusRecords: getRecords(db, app.bsky.actor.status),

  async getParaPostMeta(req) {
    const [post, meta, agg] = await Promise.all([
      db.db
        .selectFrom('para_post')
        .selectAll()
        .where('uri', '=', req.postUri)
        .executeTakeFirst(),
      db.db
        .selectFrom('para_post_meta')
        .selectAll()
        .where('postUri', '=', req.postUri)
        .executeTakeFirst(),
      db.db
        .selectFrom('post_agg')
        .selectAll()
        .where('uri', '=', req.postUri)
        .executeTakeFirst(),
    ])

    if (!post) {
      return {}
    }

    return {
      post: new ParaPostMeta({
        uri: post.uri,
        author: post.creator,
        postType: meta?.postType ?? post.postType ?? undefined,
        official: meta?.official === true || String(meta?.official) === 'true',
        party: meta?.party ?? post.party ?? undefined,
        community: meta?.community ?? post.community ?? undefined,
        category: meta?.category ?? undefined,
        tags: meta?.tags ?? post.tags ?? [],
        flairs: meta?.flairs ?? post.flairs ?? [],
        voteScore: meta?.voteScore ?? agg?.likeCount ?? 0,
        interactionMode:
          (meta?.postType ?? post.postType) === 'policy'
            ? 'policy_ballot'
            : 'reddit_votes',
        createdAt: meta?.createdAt ?? post.createdAt,
      }),
    }
  },

  async getParaPolicyTally(req) {
    const post = await db.db
      .selectFrom('para_post as post')
      .leftJoin('para_post_meta as meta', 'meta.postUri', 'post.uri')
      .select([
        'post.uri as postUri',
        'post.postType as postType',
        'meta.official as official',
        sql<string>`coalesce(meta.community, post.community)`.as('community'),
      ])
      .where('post.uri', '=', req.postUri)
      .executeTakeFirst()

    if (!post || post.postType !== 'policy') {
      return {}
    }

    const [aggregate, breakdown, eligibleVoterCount] = await Promise.all([
      db.db
        .selectFrom('para_policy_vote')
        .where('subject', '=', req.postUri)
        .where('subjectType', '=', 'policy')
        .select([
          sql<number>`count(*)`.as('voteCount'),
          sql<number>`coalesce(sum(case when "isDirect" = 1 then 1 else 0 end), 0)`.as(
            'directVoteCount',
          ),
          sql<number>`coalesce(sum(case when "isDirect" = 0 then 1 else 0 end), 0)`.as(
            'delegatedVoteCount',
          ),
          sql<number>`coalesce(sum("signal"), 0)`.as('signalSum'),
        ])
        .executeTakeFirst(),
      db.db
        .selectFrom('para_policy_vote')
        .where('subject', '=', req.postUri)
        .where('subjectType', '=', 'policy')
        .select(['signal', sql<number>`count(*)`.as('count')])
        .groupBy('signal')
        .orderBy('signal', 'asc')
        .execute(),
      getEligiblePolicyVoterCount(db, post.community ?? ''),
    ])

    const voteCount = Number(aggregate?.voteCount) || 0
    const directVoteCount = Number(aggregate?.directVoteCount) || 0
    const delegatedVoteCount = Number(aggregate?.delegatedVoteCount) || 0
    const signalSum = Number(aggregate?.signalSum) || 0
    const signalAverage = voteCount > 0 ? signalSum / voteCount : 0
    const quorumTarget = getPolicyQuorumTarget(eligibleVoterCount)
    const quorumMet = voteCount >= quorumTarget
    const outcome = getPolicyOutcome({ quorumMet, signalAverage })
    const certified = Boolean(post.official) && isPassedOutcome(outcome)
    const official = certified

    return {
      tally: new ParaPolicyTally({
        subject: req.postUri,
        subjectType: 'policy',
        community: post.community ?? '',
        voteCount,
        directVoteCount,
        delegatedVoteCount,
        signalSum,
        signalAverage,
        eligibleVoterCount,
        quorumTarget,
        quorumMet,
        official,
        certified,
        outcome,
        state: getPolicyState({ outcome, official, voteCount, quorumMet }),
        breakdown: buildSignalBreakdown(breakdown),
        computedAt: new Date().toISOString(),
      }),
    }
  },
})

export const getRecords = (db: Database, ns?: l.Main<l.RecordSchema>) => {
  const collection = ns ? l.getMain(ns).$type : undefined

  return async (req: { uris: string[] }): Promise<{ records: Record[] }> => {
    const validUris = collection
      ? req.uris.filter((uri) => new AtUri(uri).collection === collection)
      : req.uris
    const res = validUris.length
      ? await db.db
          .selectFrom('record')
          .selectAll()
          .where('uri', 'in', validUris)
          .execute()
      : []
    const byUri = keyBy(res, 'uri')
    const records: Record[] = req.uris.map((uri) => {
      const row = byUri.get(uri)
      const json = row ? row.json : JSON.stringify(null)
      const createdAtRaw = new Date(JSON.parse(json)?.['createdAt'])
      const createdAt = !isNaN(createdAtRaw.getTime())
        ? Timestamp.fromDate(createdAtRaw)
        : undefined
      const indexedAt = row?.indexedAt
        ? Timestamp.fromDate(new Date(row?.indexedAt))
        : undefined
      const recordBytes = ui8.fromString(json, 'utf8')
      return new Record({
        record: recordBytes as Uint8Array<ArrayBuffer>,
        cid: row?.cid,
        createdAt,
        indexedAt,
        sortedAt: compositeTime(createdAt, indexedAt),
        takenDown: !!row?.takedownRef,
        takedownRef: row?.takedownRef ?? undefined,
        tags: row?.tags ?? undefined,
      })
    })
    return { records }
  }
}

export const getPostRecords = (db: Database) => {
  const getRecordsAny = getRecords(db)
  return async (req: {
    uris: string[]
  }): Promise<{ records: Record[]; meta: PostRecordMeta[] }> => {
    const [{ records }, details] = await Promise.all([
      getRecordsAny(req),
      req.uris.length
        ? await db.db
            .selectFrom('post')
            .where('uri', 'in', req.uris)
            .select([
              'uri',
              'violatesThreadGate',
              'violatesEmbeddingRules',
              'hasThreadGate',
              'hasPostGate',
            ])
            .unionAll(
              db.db
                .selectFrom('para_post')
                .where('uri', 'in', req.uris)
                .select([
                  'uri',
                  sql<boolean>`false`.as('violatesThreadGate'),
                  sql<boolean>`false`.as('violatesEmbeddingRules'),
                  sql<boolean>`false`.as('hasThreadGate'),
                  sql<boolean>`false`.as('hasPostGate'),
                ]),
            )
            .execute()
        : [],
    ])
    const byKey = keyBy(details, 'uri')
    const meta = req.uris.map((uri) => {
      const detail = byKey.get(uri)
      return new PostRecordMeta({
        violatesThreadGate: !!detail?.violatesThreadGate,
        violatesEmbeddingRules: !!detail?.violatesEmbeddingRules,
        hasThreadGate: !!detail?.hasThreadGate,
        hasPostGate: !!detail?.hasPostGate,
      })
    })
    return { records, meta }
  }
}

const compositeTime = (
  ts1: Timestamp | undefined,
  ts2: Timestamp | undefined,
) => {
  if (!ts1) return ts2
  if (!ts2) return ts1
  return ts1.toDate() < ts2.toDate() ? ts1 : ts2
}

const getEligiblePolicyVoterCount = async (
  db: Database,
  community: string,
): Promise<number> => {
  const normalizedCommunity = normalizeCommunity(community)
  if (!normalizedCommunity) {
    return 0
  }

  const boardUris = await db.db
    .selectFrom('para_community_board')
    .select('uri')
    .where((qb) =>
      qb
        .where(
          sql`lower(regexp_replace(coalesce("slug", ''), '^p/', ''))`,
          '=',
          normalizedCommunity,
        )
        .orWhere(
          sql`lower(regexp_replace(coalesce("name", ''), '^p/', ''))`,
          '=',
          normalizedCommunity,
        ),
    )
    .execute()

  if (boardUris.length === 0) {
    return 0
  }

  const count = await db.db
    .selectFrom('para_community_membership')
    .where(
      'communityUri',
      'in',
      boardUris.map((row) => row.uri),
    )
    .where('membershipState', '=', 'active')
    .select(sql<number>`count(*)`.as('memberCount'))
    .executeTakeFirst()

  return Number(count?.memberCount) || 0
}

const getPolicyQuorumTarget = (eligibleVoterCount: number) => {
  if (eligibleVoterCount <= 0) {
    return 10
  }
  return Math.max(10, Math.ceil(eligibleVoterCount * 0.2))
}

const getPolicyOutcome = ({
  quorumMet,
  signalAverage,
}: {
  quorumMet: boolean
  signalAverage: number
}) => {
  if (!quorumMet) {
    return 'insufficient_quorum'
  }
  if (signalAverage >= 2) {
    return 'strong_passed'
  }
  if (signalAverage >= 1) {
    return 'passed'
  }
  if (signalAverage <= -1) {
    return 'failed'
  }
  return 'contested'
}

const getPolicyState = ({
  outcome,
  official,
  voteCount,
  quorumMet,
}: {
  outcome: string
  official: boolean
  voteCount: number
  quorumMet: boolean
}) => {
  if (official) {
    return 'official'
  }
  if (outcome === 'failed') {
    return 'failed'
  }
  if (outcome === 'passed' || outcome === 'strong_passed') {
    return 'passed'
  }
  if (outcome === 'contested') {
    return 'deliberation'
  }
  if (voteCount > 0 && !quorumMet) {
    return 'voting'
  }
  return 'draft'
}

const isPassedOutcome = (outcome: string) =>
  outcome === 'passed' || outcome === 'strong_passed'

const buildSignalBreakdown = (
  rows: Array<{ signal: number; count: number }>,
) => {
  const counts = new Map(
    rows.map((row) => [Number(row.signal), Number(row.count)]),
  )
  const buckets: ParaPolicySignalBucket[] = []
  for (let signal = -3; signal <= 3; signal++) {
    buckets.push(
      new ParaPolicySignalBucket({
        signal,
        count: counts.get(signal) ?? 0,
      }),
    )
  }
  return buckets
}

const normalizeCommunity = (value: string | undefined) =>
  value?.trim().toLowerCase().replace(/^p\//, '') || ''
