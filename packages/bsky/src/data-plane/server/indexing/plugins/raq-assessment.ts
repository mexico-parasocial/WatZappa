// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface AssessmentRecord {
  answers?: { questionId: string; value: number }[]
  results?: unknown
  compass?: unknown
  ideology?: unknown
  secondaryIdeology?: unknown
  partyMatches?: unknown
  isPublic?: boolean
  completedAt: string
  version?: string
  createdAt: string
}

type Assessment = Selectable<DatabaseSchemaType['raq_assessment']>
type IndexedAssessment = {
  record: Assessment
}

const lexId = 'com.para.raq.assessment'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: AssessmentRecord,
  timestamp: string,
): Promise<IndexedAssessment | null> => {
  const inserted = await db
    .insertInto('raq_assessment')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      answersJson: obj.answers ? JSON.stringify(obj.answers) : null,
      resultsJson: obj.results ? JSON.stringify(obj.results) : null,
      compassJson: obj.compass ? JSON.stringify(obj.compass) : null,
      ideologyJson: obj.ideology ? JSON.stringify(obj.ideology) : null,
      secondaryIdeologyJson: obj.secondaryIdeology
        ? JSON.stringify(obj.secondaryIdeology)
        : null,
      partyMatchesJson: obj.partyMatches
        ? JSON.stringify(obj.partyMatches)
        : null,
      isPublic: obj.isPublic ?? false,
      completedAt: normalizeDatetimeAlways(obj.completedAt),
      version: obj.version || null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.doUpdateSet({
        cid: cid.toString(),
        answersJson: obj.answers ? JSON.stringify(obj.answers) : null,
        resultsJson: obj.results ? JSON.stringify(obj.results) : null,
        compassJson: obj.compass ? JSON.stringify(obj.compass) : null,
        ideologyJson: obj.ideology ? JSON.stringify(obj.ideology) : null,
        secondaryIdeologyJson: obj.secondaryIdeology
          ? JSON.stringify(obj.secondaryIdeology)
          : null,
        partyMatchesJson: obj.partyMatches
          ? JSON.stringify(obj.partyMatches)
          : null,
        isPublic: obj.isPublic ?? false,
        completedAt: normalizeDatetimeAlways(obj.completedAt),
        version: obj.version || null,
        createdAt: normalizeDatetimeAlways(obj.createdAt),
        indexedAt: timestamp,
      }),
    )
    .returningAll()
    .executeTakeFirst()

  if (!inserted) return null
  return { record: inserted }
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedAssessment | null> => {
  const deleted = await db
    .deleteFrom('raq_assessment')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (
  deleted: IndexedAssessment,
  _replacedBy: IndexedAssessment | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

export type PluginType = RecordProcessor<AssessmentRecord, IndexedAssessment>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
): PluginType => {
  return new RecordProcessor(db, background, {
    lexId,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
  })
}

export default makePlugin
