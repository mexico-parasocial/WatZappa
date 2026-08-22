import type pino from 'pino'

import { type IBridgeDatabase } from './db/index.js'
import {
  computeAssemblySortitionHash,
  fetchBeacon,
} from './drand.js'
import { sendExpoNotifications } from './push.js'

/**
 * Cabildeo assembly sortition engine. Extracted verbatim from the HTTP layer:
 * eligibility, per-member ranking by drand-backed hash, threshold selection,
 * activation and push notification of the selected members.
 */

export type SortitionRunRow = {
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

export function formatSortitionRun(row: SortitionRunRow | undefined | null) {
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

export function formatSortitionCandidate(row: any) {
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

export function createSortitionEngine(db: IBridgeDatabase, log: pino.Logger) {
  const processRun = async (runId: string) => {
    const run = (await db.getSortitionRun(runId)) as SortitionRunRow | undefined
    if (!run) {
      throw new Error('Sortition run not found')
    }
    if (run.status === 'active') {
      const selected = await db.getSortitionCandidates(run.id, true)
      return {
        run: formatSortitionRun(run),
        selected: selected.map(formatSortitionCandidate),
      }
    }

    const beacon = await fetchBeacon(run.drand_round)
    const allMembers = await db.getMemberList(run.community_uri, 10_000, 0)
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
      await db.failSortitionRun(run.id)
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

    await db.replaceSortitionCandidates(run.id, candidates)
    const activated = (await db.activateSortitionRun({
      id: run.id,
      drandRandomness: beacon.randomness,
      threshold,
      eligibleCount: ranked.length,
      selectedCount,
      processedAt: now,
    })) as SortitionRunRow | undefined

    const selectedDids = candidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => candidate.did)
    const pushTokens = await db.getPushTokensByDid(selectedDids)
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

    const selectedCandidates = await db.getSortitionCandidates(run.id, true)
    return {
      run: formatSortitionRun(activated),
      selected: selectedCandidates.map(formatSortitionCandidate),
    }
  }

  const processScheduled = async () => {
    const scheduled = (await db.getScheduledSortitionRuns(
      10,
    )) as SortitionRunRow[]
    for (const run of scheduled) {
      try {
        await processRun(run.id)
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

  return { processRun, processScheduled }
}

export type SortitionEngine = ReturnType<typeof createSortitionEngine>
