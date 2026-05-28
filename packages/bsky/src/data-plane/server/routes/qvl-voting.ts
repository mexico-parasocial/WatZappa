import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { tableName as paraQvldDelegationTableName } from '../db/tables/para-qvl-delegation.js'
import { tableName as paraQvldIntensityTableName } from '../db/tables/para-qvl-intensity.js'
import { tableName as paraQvldVoteTableName } from '../db/tables/para-qvl-vote.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaVotes(req) {
    let builder = db.db
      .selectFrom(paraQvldVoteTableName)
      .selectAll()
      .where('proposal', '=', req.proposal)
      .orderBy('sortAt', 'desc')
      .limit(req.limit || 50)

    if (req.cursor) {
      builder = builder.where('sortAt', '<', req.cursor)
    }

    const rows = await builder.execute()

    return {
      itemsJson: JSON.stringify(rows),
      cursor: rows.length > 0 ? rows[rows.length - 1].sortAt : '',
    }
  },

  async getParaIntensities(req) {
    let builder = db.db
      .selectFrom(paraQvldIntensityTableName)
      .selectAll()
      .where('proposal', '=', req.proposal)
      .orderBy('sortAt', 'desc')
      .limit(req.limit || 50)

    if (req.cursor) {
      builder = builder.where('sortAt', '<', req.cursor)
    }

    const rows = await builder.execute()

    return {
      itemsJson: JSON.stringify(rows),
      cursor: rows.length > 0 ? rows[rows.length - 1].sortAt : '',
    }
  },

  async getParaDelegations(req) {
    let builder = db.db
      .selectFrom(paraQvldDelegationTableName)
      .selectAll()
      .orderBy('sortAt', 'desc')
      .limit(req.limit || 50)

    if (req.delegator) {
      builder = builder.where('delegator', '=', req.delegator)
    }

    if (req.delegate) {
      builder = builder.where('delegate', '=', req.delegate)
    }

    if (req.community) {
      builder = builder.where('scopeCommunity', '=', req.community)
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
})
