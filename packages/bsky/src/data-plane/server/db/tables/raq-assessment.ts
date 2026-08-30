import { ColumnType, GeneratedAlways } from 'kysely'
import type { com } from '../../../../lexicons.js'

export const tableName = 'raq_assessment'

// The jsonb columns are written as JSON strings and read back parsed, so the
// read side is the structured type, matching the generated raq lexicon defs.
export interface Main {
  uri: string
  cid: string
  creator: string
  answersJson: ColumnType<
    com.para.raq.assessment.Answer[] | null,
    string | null,
    string | null
  >
  resultsJson: ColumnType<
    com.para.raq.defs.AxisResult[] | null,
    string | null,
    string | null
  >
  compassJson: ColumnType<
    com.para.raq.defs.CompassPosition | null,
    string | null,
    string | null
  >
  ideologyJson: ColumnType<
    com.para.raq.defs.IdeologyMatch | null,
    string | null,
    string | null
  >
  secondaryIdeologyJson: ColumnType<
    com.para.raq.defs.IdeologyMatch | null,
    string | null,
    string | null
  >
  partyMatchesJson: ColumnType<
    com.para.raq.defs.PartyMatch[] | null,
    string | null,
    string | null
  >
  isPublic: boolean
  completedAt: string
  version: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: Main
}
