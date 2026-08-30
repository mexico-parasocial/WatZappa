import { Selectable } from 'kysely'
import { Cid } from '@atproto/lex'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons.js'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

type Assessment = Selectable<DatabaseSchemaType['raq_assessment']>

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: com.para.raq.assessment.Main,
  timestamp: string,
): Promise<Assessment | null> => {
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
      // The assessment lexicon carries no createdAt of its own — completedAt
      // is the record's timestamp, so it also orders the row (sortAt).
      createdAt: normalizeDatetimeAlways(obj.completedAt),
      version: obj.version || null,
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
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
        createdAt: normalizeDatetimeAlways(obj.completedAt),
        version: obj.version || null,
        indexedAt: timestamp,
      }),
    )
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<Assessment | null> => {
  const deleted = await db
    .deleteFrom('raq_assessment')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? deleted : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (deleted: Assessment) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = ReturnType<typeof makePlugin>

export const makePlugin = (db: Database, background: BackgroundQueue) => {
  return new RecordProcessor(db, background, {
    schema: com.para.raq.assessment.main,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
  })
}

export default makePlugin
