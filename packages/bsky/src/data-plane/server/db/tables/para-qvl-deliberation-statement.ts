import { GeneratedAlways } from 'kysely'

export const tableName = 'para_qvld_deliberation_statement'

export interface ParaQvldDeliberationStatement {
  uri: string
  cid: string
  creator: string
  proposal: string
  body: string
  stance: string
  agreeCount: number
  disagreeCount: number
  passCount: number
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaQvldDeliberationStatement
}
