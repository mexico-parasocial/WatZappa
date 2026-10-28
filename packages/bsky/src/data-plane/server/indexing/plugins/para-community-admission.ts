import type { Selectable } from 'kysely'
import type { Cid } from '@atproto/lex'
import { AtUri, isValidDid, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons.js'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

type AdmissionRecord = com.para.community.admission.Main
type IndexedAdmission = Selectable<
  DatabaseSchemaType['para_community_admission']
>

export async function indexAdmission(
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: AdmissionRecord,
  timestamp: string,
): Promise<IndexedAdmission | null> {
  const boardUri = new AtUri(obj.community)
  if (
    boardUri.collection !== 'com.para.community.board' ||
    boardUri.host !== uri.host ||
    !isValidDid(obj.member) ||
    !['active', 'removed', 'blocked'].includes(obj.state)
  ) {
    throw new Error('Admission must be issued from the board repository')
  }
  const board = await db
    .selectFrom('para_community_board')
    .select('uri')
    .where('uri', '=', obj.community)
    .where('creator', '=', uri.host)
    .executeTakeFirst()
  if (!board) throw new Error('Admission board is not indexed')
  return (
    (await db
      .insertInto('para_community_admission')
      .values({
        uri: uri.toString(),
        cid: cid.toString(),
        creator: uri.host,
        communityUri: obj.community,
        memberDid: obj.member,
        state: obj.state,
        decidedAt: normalizeDatetimeAlways(obj.decidedAt),
        indexedAt: timestamp,
      })
      .onConflict((oc) =>
        oc
          .columns(['communityUri', 'memberDid'])
          .doUpdateSet({
            uri: uri.toString(),
            cid: cid.toString(),
            creator: uri.host,
            state: obj.state,
            decidedAt: normalizeDatetimeAlways(obj.decidedAt),
            indexedAt: timestamp,
          })
          .where((eb) =>
            eb.or([
              eb(
                'para_community_admission.decidedAt',
                '<',
                normalizeDatetimeAlways(obj.decidedAt),
              ),
              eb.and([
                eb(
                  'para_community_admission.decidedAt',
                  '=',
                  normalizeDatetimeAlways(obj.decidedAt),
                ),
                eb('para_community_admission.uri', '<', uri.toString()),
              ]),
            ]),
          ),
      )
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

async function deleteFn(
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedAdmission | null> {
  return (
    (await db
      .deleteFrom('para_community_admission')
      .where('uri', '=', uri.toString())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type PluginType = RecordProcessor<
  typeof com.para.community.admission.main,
  IndexedAdmission
>

export function makePlugin(
  db: Database,
  background: BackgroundQueue,
): PluginType {
  return new RecordProcessor(db, background, {
    schema: com.para.community.admission.main,
    insertFn: indexAdmission,
    findDuplicate: async () => null,
    deleteFn,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
}
