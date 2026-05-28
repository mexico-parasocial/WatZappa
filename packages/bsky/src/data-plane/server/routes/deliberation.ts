import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { tableName as paraQvldDeliberationStatementTableName } from '../db/tables/para-qvl-deliberation-statement.js'
import { tableName as paraQvldDeliberationVoteTableName } from '../db/tables/para-qvl-deliberation-vote.js'
import { countAll } from '../db/util.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaDeliberations(req) {
    let builder = db.db
      .selectFrom(paraQvldDeliberationStatementTableName)
      .selectAll()
      .where('proposal', '=', req.proposal)
      .orderBy('sortAt', 'desc')
      .limit(req.limit || 50)

    if (req.stance) {
      builder = builder.where('stance', '=', req.stance)
    }

    if (req.cursor) {
      builder = builder.where('sortAt', '<', req.cursor)
    }

    const rows = await builder.execute()

    return {
      itemsJson: JSON.stringify(rows),
      cursor: rows.length > 0 ? rows[rows.length - 1].sortAt : '',
    }
  },

  async getParaDeliberationVotes(req) {
    let builder = db.db
      .selectFrom(paraQvldDeliberationVoteTableName)
      .selectAll()
      .where('statement', '=', req.statement)
      .orderBy('sortAt', 'desc')
      .limit(req.limit || 50)

    if (req.direction) {
      builder = builder.where('vote', '=', req.direction)
    }

    if (req.cursor) {
      builder = builder.where('sortAt', '<', req.cursor)
    }

    const rows = await builder.execute()

    return {
      itemsJson: JSON.stringify(rows),
      cursor: rows.length > 0 ? rows[rows.length - 1].sortAt : '',
    }
  },

  async getParaDeliberationClusters(req) {
    const stanceRows = await db.db
      .selectFrom(paraQvldDeliberationStatementTableName)
      .where('proposal', '=', req.proposal)
      .select(['stance'])
      .select([
        countAll.as('statementCount'),
        sql<number>`sum("agreeCount")`.as('totalAgree'),
        sql<number>`sum("disagreeCount")`.as('totalDisagree'),
        sql<number>`sum("passCount")`.as('totalPass'),
      ])
      .groupBy('stance')
      .execute()

    const clusters = stanceRows.map((row) => ({
      stance: row.stance,
      statementCount: Number(row.statementCount),
      totalAgree: Number(row.totalAgree || 0),
      totalDisagree: Number(row.totalDisagree || 0),
      totalPass: Number(row.totalPass || 0),
    }))

    // Bridging: high engagement from both sides
    const bridgingRows = await db.db
      .selectFrom(paraQvldDeliberationStatementTableName)
      .where('proposal', '=', req.proposal)
      .selectAll()
      .where('agreeCount', '>', 0)
      .where('disagreeCount', '>', 0)
      .orderBy(sql<number>`least("agreeCount", "disagreeCount")`, 'desc')
      .limit(10)
      .execute()

    const bridging = bridgingRows.map((row) => ({
      uri: row.uri,
      body: row.body,
      agreeCount: row.agreeCount,
      disagreeCount: row.disagreeCount,
      passCount: row.passCount,
    }))

    return {
      clustersJson: JSON.stringify(clusters),
      bridgingJson: JSON.stringify(bridging),
    }
  },
})
