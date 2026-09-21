import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { tableName as statementTableName } from '../db/tables/para-deliberation-statement.js'
import { tableName as voteTableName } from '../db/tables/para-deliberation-vote.js'

type StatementAggregate = {
  agreeCount: number
  disagreeCount: number
  passCount: number
  viewerDirection?: string
}

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaDeliberations(req) {
    let builder = db.db
      .selectFrom(statementTableName)
      .selectAll()
      .where('proposal', '=', req.proposal)
      .orderBy('sortAt', 'desc')
      .limit(req.limit || 50)

    if (req.cursor) {
      builder = builder.where('sortAt', '<', req.cursor)
    }

    const statements = await builder.execute()
    const uris = statements.map((s) => s.uri)

    const votes = uris.length
      ? await db.db
          .selectFrom(voteTableName)
          .select(['statement', 'creator', 'direction'])
          .where('statement', 'in', uris)
          .execute()
      : []

    const aggregates = new Map<string, StatementAggregate>()
    for (const uri of uris) {
      aggregates.set(uri, {
        agreeCount: 0,
        disagreeCount: 0,
        passCount: 0,
      })
    }

    for (const vote of votes) {
      const agg = aggregates.get(vote.statement)
      if (!agg) continue
      if (vote.direction === 'agree') {
        agg.agreeCount += 1
      } else if (vote.direction === 'disagree') {
        agg.disagreeCount += 1
      } else {
        agg.passCount += 1
      }
      if (req.viewer && vote.creator === req.viewer) {
        agg.viewerDirection = vote.direction
      }
    }

    const items = statements.map((statement) => ({
      ...statement,
      ...aggregates.get(statement.uri),
    }))

    return {
      itemsJson: JSON.stringify(items),
      cursor:
        statements.length > 0 ? statements[statements.length - 1].sortAt : '',
    }
  },
})
