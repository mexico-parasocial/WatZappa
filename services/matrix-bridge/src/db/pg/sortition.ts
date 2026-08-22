import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ConstitutionProposalsArea } from './constitution-proposals.js'

export class SortitionArea extends ConstitutionProposalsArea {


  // Sortition proofs
  async saveSortitionProof(proof: {
    did: string
    communityUri: string
    chamber: 'A' | 'B'
    drandRound: number
    drandRandomness: string
    hashInput: string
    hashOutput: string
    threshold: number
    timestamp: string
  }): Promise<void> {
    await this.run(
      `INSERT INTO sortition_proofs (did, community_uri, chamber, drand_round, drand_randomness, hash_input, hash_output, threshold, timestamp, verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
       ON CONFLICT (did, community_uri) DO UPDATE SET chamber = EXCLUDED.chamber, drand_round = EXCLUDED.drand_round, drand_randomness = EXCLUDED.drand_randomness, hash_input = EXCLUDED.hash_input, hash_output = EXCLUDED.hash_output, threshold = EXCLUDED.threshold, timestamp = EXCLUDED.timestamp, verified = 1`,
      [
        proof.did,
        proof.communityUri,
        proof.chamber,
        proof.drandRound,
        proof.drandRandomness,
        proof.hashInput,
        proof.hashOutput,
        proof.threshold,
        proof.timestamp,
      ],
    )
  }


  async getSortitionProof(
    did: string,
    communityUri: string,
  ): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM sortition_proofs WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }


  async getSortitionProofsByCommunity(communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM sortition_proofs WHERE community_uri = $1 ORDER BY timestamp DESC',
      [communityUri],
    )
  }


  async getUnverifiedProofs(limit = 100): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM sortition_proofs WHERE verified = 0 ORDER BY timestamp DESC LIMIT $1',
      [limit],
    )
  }


  async markProofVerified(id: number): Promise<void> {
    await this.run('UPDATE sortition_proofs SET verified = 1 WHERE id = $1', [
      id,
    ])
  }


  async getSortitionProofCount(): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sortition_proofs',
    )
    return row?.count ?? 0
  }


  // Sortition run lifecycle
  async createSortitionRun(run: {
    id: string
    cabildeoUri: string
    communityUri: string
    createdByDid: string
    assemblySize: number
    eligibilityFilter: string
    drandRound: number
    configRecordJson: string
    createdAt: string
  }): Promise<any> {
    await this.run(
      `INSERT INTO sortition_runs (
        id, cabildeo_uri, community_uri, created_by_did, assembly_size,
        eligibility_filter, drand_round, status, config_record_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8, $9)`,
      [
        run.id,
        run.cabildeoUri,
        run.communityUri,
        run.createdByDid,
        run.assemblySize,
        run.eligibilityFilter,
        run.drandRound,
        run.configRecordJson,
        run.createdAt,
      ],
    )
    return this.getSortitionRun(run.id)
  }


  async getSortitionRun(id: string): Promise<any | undefined> {
    return this.queryOne('SELECT * FROM sortition_runs WHERE id = $1', [id])
  }


  async getSortitionRunByCabildeo(
    cabildeoUri: string,
  ): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM sortition_runs WHERE cabildeo_uri = $1',
      [cabildeoUri],
    )
  }


  async getScheduledSortitionRuns(limit = 10): Promise<any[]> {
    return this.queryAll(
      "SELECT * FROM sortition_runs WHERE status = 'scheduled' ORDER BY drand_round ASC LIMIT $1",
      [limit],
    )
  }


  async replaceSortitionCandidates(
    runId: string,
    candidates: Array<{
      did: string
      communityUri: string
      cabildeoUri: string
      hashInput: string
      hashOutput: string
      hashValue: number
      threshold: number
      selected: boolean
      createdAt: string
    }>,
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM sortition_candidates WHERE run_id = $1', [
        runId,
      ])
      for (const c of candidates) {
        await client.query(
          `INSERT INTO sortition_candidates (
            run_id, did, community_uri, cabildeo_uri, hash_input, hash_output,
            hash_value, threshold, selected, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            runId,
            c.did,
            c.communityUri,
            c.cabildeoUri,
            c.hashInput,
            c.hashOutput,
            c.hashValue,
            c.threshold,
            c.selected ? 1 : 0,
            c.createdAt,
          ],
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }


  async activateSortitionRun(run: {
    id: string
    drandRandomness: string
    threshold: number
    eligibleCount: number
    selectedCount: number
    processedAt: string
  }): Promise<any | undefined> {
    await this.run(
      `UPDATE sortition_runs
       SET status = 'active', drand_randomness = $1, threshold = $2,
           eligible_count = $3, selected_count = $4, processed_at = $5
       WHERE id = $6`,
      [
        run.drandRandomness,
        run.threshold,
        run.eligibleCount,
        run.selectedCount,
        run.processedAt,
        run.id,
      ],
    )
    return this.getSortitionRun(run.id)
  }


  async failSortitionRun(id: string): Promise<void> {
    await this.run(
      "UPDATE sortition_runs SET status = 'failed', processed_at = NOW() WHERE id = $1",
      [id],
    )
  }


  async getSortitionCandidates(
    runId: string,
    selectedOnly = false,
  ): Promise<any[]> {
    if (selectedOnly) {
      return this.queryAll(
        'SELECT * FROM sortition_candidates WHERE run_id = $1 AND selected = 1 ORDER BY hash_value ASC',
        [runId],
      )
    }
    return this.queryAll(
      'SELECT * FROM sortition_candidates WHERE run_id = $1 ORDER BY hash_value ASC',
      [runId],
    )
  }


  async getSortitionCandidate(
    runId: string,
    did: string,
  ): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM sortition_candidates WHERE run_id = $1 AND did = $2',
      [runId, did],
    )
  }
}
