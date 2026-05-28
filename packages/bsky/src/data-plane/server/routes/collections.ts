import { PlainMessage, Timestamp } from '@bufbuild/protobuf'
import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { CollectionInfo } from '../../../proto/bsky_pb.js'
import { Database } from '../db/index.js'
import { IsoUpdatedAtKey } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getActorCollections(req) {
    const { actorDid, cursor, limit } = req
    const { ref } = db.db.dynamic

    let builder = db.db
      .selectFrom('collection')
      .where('collection.creator', '=', actorDid)
      .selectAll()

    const key = new IsoUpdatedAtKey(ref('collection.updatedAt'))
    builder = key.paginate(builder, {
      cursor,
      limit,
    })

    const res = await builder.execute()
    return {
      collections: res.map(
        (d): PlainMessage<CollectionInfo> => ({
          key: d.key,
          payload: Buffer.from(d.payload),
          createdAt: Timestamp.fromDate(new Date(d.createdAt)),
          updatedAt: Timestamp.fromDate(new Date(d.updatedAt)),
        }),
      ),
      cursor: key.packFromResult(res),
    }
  },

  async getCollectionByKey(req) {
    const { actorDid, key } = req
    const row = await db.db
      .selectFrom('collection')
      .where('collection.creator', '=', actorDid)
      .where('collection.key', '=', key)
      .selectAll()
      .executeTakeFirst()

    if (!row) {
      return {}
    }

    return {
      collection: {
        key: row.key,
        payload: Buffer.from(row.payload),
        createdAt: Timestamp.fromDate(new Date(row.createdAt)),
        updatedAt: Timestamp.fromDate(new Date(row.updatedAt)),
      },
    }
  },
})
