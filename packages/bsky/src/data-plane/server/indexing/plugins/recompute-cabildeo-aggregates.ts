import { sql } from 'kysely'
import { resolveCabildeoDelegationNullifier } from '@atproto/common'
import type { DatabaseSchema } from '../../db/database-schema.js'
import { resolveCabildeoDelegations } from './resolve-cabildeo-delegations.js'

export const recomputeCabildeoAggregates = async (
  db: DatabaseSchema,
  cabildeoUri: string,
) => {
  const cabildeo = await db
    .selectFrom('cabildeo_cabildeo')
    .where('uri', '=', cabildeoUri)
    .select(['uri', 'options', 'flairs', 'community', 'phase'])
    .executeTakeFirst()

  if (!cabildeo) return

  const final = await db
    .selectFrom('cabildeo_final_tally')
    .where('cabildeo', '=', cabildeoUri)
    .select('summary')
    .executeTakeFirst()
  if (final) {
    await db
      .updateTable('cabildeo_cabildeo')
      .set(snapshotForUpdate(final.summary))
      .where('uri', '=', cabildeoUri)
      .execute()
    return
  }

  const closePolicy = await db
    .selectFrom('cabildeo_close_policy')
    .where('cabildeo', '=', cabildeoUri)
    .select(['deadline'])
    .executeTakeFirst()
  const closedAt =
    closePolicy?.deadline && Date.parse(closePolicy.deadline) <= Date.now()
      ? closePolicy.deadline
      : cabildeo.phase === 'resolved'
        ? new Date().toISOString()
        : null

  const options = asOptions(cabildeo.options)
  const optionCount = options.length
  const optionVoteCounts = Array.from({ length: optionCount }, () => 0)
  const optionPositionCounts = Array.from({ length: optionCount }, () => 0)

  const scopedFlairs = cabildeo.flairs || []
  const [positions, votes, delegationCountRes] = await Promise.all([
    db
      .selectFrom('cabildeo_position')
      .where('cabildeo', '=', cabildeoUri)
      .select(['stance', 'optionIndex'])
      .execute(),
    db
      .selectFrom('cabildeo_vote')
      .where('cabildeo', '=', cabildeoUri)
      .select([
        'uri',
        'creator',
        'isDirect',
        'selectedOption',
        'voteNullifier',
        'indexedAt',
      ])
      .$if(!!closedAt, (qb) => qb.where('indexedAt', '<=', closedAt!))
      .execute(),
    db
      .selectFrom('cabildeo_delegation')
      .where('eligibilityProofRef', 'is not', null)
      .where((eb) =>
        scopedFlairs.length
          ? eb.or([
              eb('cabildeo', '=', cabildeoUri),
              eb.and([
                eb('cabildeo', 'is', null),
                sql<boolean>`"scopeFlairs" ?| ${sql`ARRAY[${sql.join(scopedFlairs)}]`}`,
              ]),
            ])
          : eb('cabildeo', '=', cabildeoUri),
      )
      .select(sql<number>`count(*)::int`.as('count'))
      .executeTakeFirst(),
  ])

  let positionForCount = 0
  let positionAgainstCount = 0
  let positionAmendmentCount = 0

  for (const position of positions) {
    if (position.stance === 'for') positionForCount++
    if (position.stance === 'against') positionAgainstCount++
    if (position.stance === 'amendment') positionAmendmentCount++
    if (
      typeof position.optionIndex === 'number' &&
      position.optionIndex >= 0 &&
      position.optionIndex < optionPositionCounts.length
    ) {
      optionPositionCounts[position.optionIndex]++
    }
  }

  let directVoteCount = 0
  let delegatedVoteCount = 0

  for (const vote of votes) {
    if (vote.isDirect === 1) {
      directVoteCount++
    } else {
      delegatedVoteCount++
    }
    if (
      typeof vote.selectedOption === 'number' &&
      vote.selectedOption >= 0 &&
      vote.selectedOption < optionVoteCounts.length
    ) {
      optionVoteCounts[vote.selectedOption]++
    }
  }

  const voteCount = votes.length
  const positionCount = positions.length
  let delegationCount = delegationCountRes?.count ?? 0
  const { winningOption, isTie } = computeWinner(optionVoteCounts)
  let effectivePowerMicros = optionVoteCounts.map((n) => n * 1_000_000)
  let effectiveTotalPowerMicros = voteCount * 1_000_000
  let resolvedWinner = winningOption
  let resolvedTie = isTie
  let resolvedDirectCount = directVoteCount
  let resolvedDelegatedCount = delegatedVoteCount
  let resolvedVoteCount = voteCount
  const acceptedBallots = votes
    .filter(
      (vote) =>
        vote.isDirect === 1 &&
        vote.voteNullifier &&
        typeof vote.selectedOption === 'number',
    )
    .map((vote) => ({
      actorDid: vote.creator,
      nullifier: vote.voteNullifier!,
      selectedOption: vote.selectedOption!,
      indexedAt: vote.indexedAt,
      uri: vote.uri,
    }))
  let acceptedDelegations: Array<{
    actorDid: string
    nullifier: string
    delegateTo: string
    mode: 'active' | 'passive'
    indexedAt: string
    uri: string
  }> = []

  if (process.env.PARA_CABILDEO_DELEGATION_TALLY_ENABLED === '1') {
    const communitySlug = cabildeo.community
      .replace(/^p\//, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const board = await db
      .selectFrom('para_community_board')
      .where((eb) =>
        eb.or([
          eb('uri', '=', cabildeo.community),
          eb('slug', '=', communitySlug),
          eb(
            sql`regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]+', '-', 'g')`,
            '=',
            communitySlug,
          ),
        ]),
      )
      .select('uri')
      .executeTakeFirst()
    const [grants, statuses] = await Promise.all([
      db
        .selectFrom('cabildeo_delegation')
        .where((eb) =>
          eb.or([eb('cabildeo', '=', cabildeoUri), eb('cabildeo', 'is', null)]),
        )
        .select([
          'uri',
          'creator',
          'mode',
          'cabildeo',
          'delegateTo',
          'party',
          'community',
          'scopeFlairs',
          'eligibilityProofRef',
          'indexedAt',
        ])
        .$if(!!closedAt, (qb) => qb.where('indexedAt', '<=', closedAt!))
        .execute(),
      db.selectFrom('para_status').select(['did', 'party']).execute(),
    ])
    const members = board
      ? await db
          .selectFrom('para_community_membership')
          .where('communityUri', '=', board.uri)
          .where('membershipState', '=', 'active')
          .select('creator')
          .execute()
      : []
    const memberDids = new Set(members.map((member) => member.creator))
    const partyByDid = new Map(
      statuses.map((s) => [s.did, (s.party ?? '').trim().toLowerCase()]),
    )
    const eligible = grants.filter((grant) => {
      if (
        !grant.eligibilityProofRef ||
        !grant.delegateTo ||
        !memberDids.has(grant.creator) ||
        grant.creator === grant.delegateTo
      )
        return false
      if (grant.mode === 'active') return grant.cabildeo === cabildeoUri
      if (grant.mode !== 'passive' || grant.cabildeo !== null) return false
      return (
        grant.community?.trim().toLowerCase() ===
          cabildeo.community.trim().toLowerCase() &&
        partyByDid.get(grant.delegateTo) ===
          grant.party?.trim().toLowerCase() &&
        !!grant.scopeFlairs?.some((flair) =>
          scopedFlairs.some(
            (subjectFlair) =>
              subjectFlair.trim().toLowerCase() === flair.trim().toLowerCase(),
          ),
        )
      )
    })
    const scopedGrants = await Promise.all(
      eligible.map(async (grant) => {
        const nullifier = await resolveCabildeoDelegationNullifier(
          grant.creator,
          {
            mode: grant.mode,
            delegateTo: grant.delegateTo,
            cabildeo: grant.cabildeo ?? undefined,
            party: grant.party ?? undefined,
            community: grant.community ?? undefined,
            scopeFlairs: grant.scopeFlairs ?? undefined,
            eligibilityProofRef: grant.eligibilityProofRef,
          },
          cabildeoUri,
        )
        return nullifier
          ? {
              actorDid: grant.creator,
              nullifier,
              delegateTo: grant.delegateTo!,
              mode: grant.mode as 'active' | 'passive',
              indexedAt: grant.indexedAt,
              uri: grant.uri,
            }
          : null
      }),
    )
    acceptedDelegations = scopedGrants.filter(
      (grant): grant is NonNullable<typeof grant> => !!grant,
    )
    delegationCount = new Set(
      acceptedDelegations.map((grant) => grant.nullifier),
    ).size
    const tally = resolveCabildeoDelegations(
      optionCount,
      acceptedBallots,
      acceptedDelegations,
    )
    effectivePowerMicros = tally.effectivePowerMicros
    optionVoteCounts.splice(
      0,
      optionVoteCounts.length,
      ...tally.optionPersonCounts,
    )
    effectiveTotalPowerMicros = tally.effectiveTotalPowerMicros
    resolvedWinner = tally.winningOption
    resolvedTie = tally.isTie ? 1 : 0
    resolvedDirectCount = tally.direct
    resolvedDelegatedCount = tally.delegated
    resolvedVoteCount = tally.totalParticipants
  }

  const summary = {
    positionCount,
    positionForCount,
    positionAgainstCount,
    positionAmendmentCount,
    voteCount: resolvedVoteCount,
    directVoteCount: resolvedDirectCount,
    delegatedVoteCount: resolvedDelegatedCount,
    delegationCount,
    optionVoteCounts: sql<number[]>`${JSON.stringify(optionVoteCounts)}`,
    optionEffectivePowerMicros: sql<
      number[]
    >`${JSON.stringify(effectivePowerMicros)}`,
    effectiveTotalPowerMicros: String(effectiveTotalPowerMicros),
    optionPositionCounts: sql<
      number[]
    >`${JSON.stringify(optionPositionCounts)}`,
    winningOption: resolvedWinner,
    isTie: resolvedTie as 0 | 1,
  }
  if (closedAt) {
    await db
      .insertInto('cabildeo_final_tally')
      .values({
        cabildeo: cabildeoUri,
        closedAt,
        finalizedAt: new Date().toISOString(),
        acceptedInputs: {
          optionCount,
          ballots: acceptedBallots,
          delegations: acceptedDelegations,
          positions,
          delegatedTallyEnabled:
            process.env.PARA_CABILDEO_DELEGATION_TALLY_ENABLED === '1',
        },
        summary: {
          ...summary,
          phase: 'resolved',
          optionVoteCounts,
          optionEffectivePowerMicros: effectivePowerMicros,
          optionPositionCounts,
        },
      })
      .onConflict((oc) => oc.doNothing())
      .execute()
    const committed = await db
      .selectFrom('cabildeo_final_tally')
      .where('cabildeo', '=', cabildeoUri)
      .select('summary')
      .executeTakeFirstOrThrow()
    await db
      .updateTable('cabildeo_cabildeo')
      .set(snapshotForUpdate(committed.summary))
      .where('uri', '=', cabildeoUri)
      .execute()
    return
  }
  await db
    .updateTable('cabildeo_cabildeo')
    .set(summary)
    .where('uri', '=', cabildeoUri)
    .execute()
}

function snapshotForUpdate(value: unknown) {
  const summary = value as Record<string, unknown>
  return {
    ...summary,
    optionVoteCounts: sql<
      number[]
    >`${JSON.stringify(summary.optionVoteCounts)}`,
    optionEffectivePowerMicros: sql<
      number[]
    >`${JSON.stringify(summary.optionEffectivePowerMicros)}`,
    optionPositionCounts: sql<
      number[]
    >`${JSON.stringify(summary.optionPositionCounts)}`,
  }
}

type CabildeoOption = {
  label?: string
  description?: string
  isConsensus?: boolean
}

const asOptions = (value: unknown): CabildeoOption[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'object' && item !== null)
}

const computeWinner = (optionVoteCounts: number[]) => {
  if (optionVoteCounts.length === 0) {
    return { winningOption: null as number | null, isTie: 0 as 0 | 1 }
  }

  const maxVotes = Math.max(...optionVoteCounts)
  if (maxVotes <= 0) {
    return { winningOption: null as number | null, isTie: 0 as 0 | 1 }
  }

  const winners = optionVoteCounts
    .map((votes, index) => ({ votes, index }))
    .filter((item) => item.votes === maxVotes)

  if (winners.length !== 1) {
    return { winningOption: null as number | null, isTie: 1 as 0 | 1 }
  }

  return { winningOption: winners[0].index, isTie: 0 as 0 | 1 }
}
