import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ConstitutionProposalsArea } from './constitution-proposals.js'

export class SortitionArea extends ConstitutionProposalsArea {


  // Sortition proofs
  saveSortitionProof(proof: {
    did: string
    communityUri: string
    chamber: 'A' | 'B'
    drandRound: number
    drandRandomness: string
    hashInput: string
    hashOutput: string
    threshold: number
    timestamp: string
  }): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO sortition_proofs (did, community_uri, chamber, drand_round, drand_randomness, hash_input, hash_output, threshold, timestamp, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
      )
      .run(
        proof.did,
        proof.communityUri,
        proof.chamber,
        proof.drandRound,
        proof.drandRandomness,
        proof.hashInput,
        proof.hashOutput,
        proof.threshold,
        proof.timestamp,
      )
  }


  getSortitionProof(did: string, communityUri: string): any | undefined {
    return this.db
      .prepare(
        'SELECT * FROM sortition_proofs WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri)
  }


  getSortitionProofsByCommunity(communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM sortition_proofs WHERE community_uri = ? ORDER BY timestamp DESC',
      )
      .all(communityUri) as any[]
  }


  getUnverifiedProofs(limit = 100): any[] {
    return this.db
      .prepare(
        'SELECT * FROM sortition_proofs WHERE verified = 0 ORDER BY timestamp DESC LIMIT ?',
      )
      .all(limit) as any[]
  }


  markProofVerified(id: number): void {
    this.db
      .prepare('UPDATE sortition_proofs SET verified = 1 WHERE id = ?')
      .run(id)
  }


  getSortitionProofCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM sortition_proofs')
      .get() as { count: number }
    return row.count
  }


  // Cabildeo sortition assemblies
  createSortitionRun(run: {
    id: string
    cabildeoUri: string
    communityUri: string
    createdByDid: string
    assemblySize: number
    eligibilityFilter: string
    drandRound: number
    configRecordJson: string
    createdAt: string
  }): any {
    this.db
      .prepare(
        `INSERT INTO sortition_runs (
          id, cabildeo_uri, community_uri, created_by_did, assembly_size,
          eligibility_filter, drand_round, status, config_record_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      )
      .run(
        run.id,
        run.cabildeoUri,
        run.communityUri,
        run.createdByDid,
        run.assemblySize,
        run.eligibilityFilter,
        run.drandRound,
        run.configRecordJson,
        run.createdAt,
      )
    return this.getSortitionRun(run.id)
  }


  getSortitionRun(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM sortition_runs WHERE id = ?').get(id)
  }


  getSortitionRunByCabildeo(cabildeoUri: string): any | undefined {
    return this.db
      .prepare('SELECT * FROM sortition_runs WHERE cabildeo_uri = ?')
      .get(cabildeoUri)
  }


  getScheduledSortitionRuns(limit = 10): any[] {
    return this.db
      .prepare(
        'SELECT * FROM sortition_runs WHERE status = ? ORDER BY drand_round ASC LIMIT ?',
      )
      .all('scheduled', limit) as any[]
  }


  replaceSortitionCandidates(
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
  ): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO sortition_candidates (
        run_id, did, community_uri, cabildeo_uri, hash_input, hash_output,
        hash_value, threshold, selected, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tx = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM sortition_candidates WHERE run_id = ?')
        .run(runId)
      for (const candidate of candidates) {
        insert.run(
          runId,
          candidate.did,
          candidate.communityUri,
          candidate.cabildeoUri,
          candidate.hashInput,
          candidate.hashOutput,
          candidate.hashValue,
          candidate.threshold,
          candidate.selected ? 1 : 0,
          candidate.createdAt,
        )
      }
    })
    tx()
  }


  activateSortitionRun(run: {
    id: string
    drandRandomness: string
    threshold: number
    eligibleCount: number
    selectedCount: number
    processedAt: string
  }): any | undefined {
    this.db
      .prepare(
        `UPDATE sortition_runs
         SET status = 'active',
             drand_randomness = ?,
             threshold = ?,
             eligible_count = ?,
             selected_count = ?,
             processed_at = ?
         WHERE id = ?`,
      )
      .run(
        run.drandRandomness,
        run.threshold,
        run.eligibleCount,
        run.selectedCount,
        run.processedAt,
        run.id,
      )
    return this.getSortitionRun(run.id)
  }


  failSortitionRun(id: string): void {
    this.db
      .prepare(
        "UPDATE sortition_runs SET status = 'failed', processed_at = datetime('now') WHERE id = ?",
      )
      .run(id)
  }


  getSortitionCandidates(runId: string, selectedOnly = false): any[] {
    const sql = selectedOnly
      ? 'SELECT * FROM sortition_candidates WHERE run_id = ? AND selected = 1 ORDER BY hash_value ASC'
      : 'SELECT * FROM sortition_candidates WHERE run_id = ? ORDER BY hash_value ASC'
    return this.db.prepare(sql).all(runId) as any[]
  }


  getSortitionCandidate(runId: string, did: string): any | undefined {
    return this.db
      .prepare(
        'SELECT * FROM sortition_candidates WHERE run_id = ? AND did = ?',
      )
      .get(runId, did)
  }
}
