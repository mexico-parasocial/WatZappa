export const tableName = 'para_qvld_eigenstate_snapshot'

export interface ParaQvldEigenstateSnapshot {
  uri: string
  cid: string
  creator: string
  community: string
  computedAt: string
  eigenvalues: unknown // JSON array of eigenvalueEntry
  correlationMatrix: unknown // JSON array of correlationEntry
  ttlSeconds: number
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaQvldEigenstateSnapshot
}
