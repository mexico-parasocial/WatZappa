import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { TimeCidKeyset, paginate } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaHighlights(req) {
    const { ref } = db.db.dynamic

    let builder = db.db
      .selectFrom('highlight_annotation')
      .where('visibility', '=', 'public')
      .selectAll()

    const normalizedCommunity = normalizeFacet(req.community)
    const normalizedState = normalizeFacet(req.state)
    const subjectUri = req.subjectUri?.trim()
    const creator = req.creator?.trim()

    if (normalizedCommunity) {
      builder = builder.where(
        sql`lower(coalesce("community", ''))`,
        '=',
        normalizedCommunity,
      )
    }
    if (normalizedState) {
      builder = builder.where(
        sql`lower(coalesce("state", ''))`,
        '=',
        normalizedState,
      )
    }
    if (subjectUri) {
      builder = builder.where('subjectUri', '=', subjectUri)
    }
    if (creator) {
      builder = builder.where('creator', '=', creator)
    }

    const keyset = new TimeCidKeyset(
      ref('highlight_annotation.sortAt'),
      ref('highlight_annotation.cid'),
    )

    builder = paginate(builder, {
      limit: req.limit,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const rows = await builder.execute()
    return {
      items: rows.map(mapHighlightRow),
      cursor: keyset.packFromResult(rows),
    }
  },

  async getParaHighlight(req) {
    const row = await db.db
      .selectFrom('highlight_annotation')
      .where('uri', '=', req.highlightUri)
      .selectAll()
      .executeTakeFirst()

    if (!row || row.visibility !== 'public') {
      return {}
    }

    return {
      highlight: mapHighlightRow(row),
    }
  },
})

const mapHighlightRow = (row: {
  uri: string
  cid: string
  creator: string
  indexedAt: string
  subjectUri: string
  subjectCid: string | null
  text: string
  start: number
  end: number
  color: string
  tag: string | null
  community: string | null
  state: string | null
  party: string | null
  visibility: string
  createdAt: string
}) => ({
  uri: row.uri,
  cid: row.cid,
  creator: row.creator,
  indexedAt: row.indexedAt,
  subjectUri: row.subjectUri,
  subjectCid: row.subjectCid ?? '',
  text: row.text,
  start: row.start,
  end: row.end,
  color: row.color,
  tag: row.tag ?? '',
  community: row.community ?? '',
  state: row.state ?? '',
  party: row.party ?? '',
  visibility: row.visibility,
  createdAt: row.createdAt,
})

const normalizeFacet = (value?: string) =>
  value?.trim().replace(/^p\//i, '').toLowerCase() || ''
