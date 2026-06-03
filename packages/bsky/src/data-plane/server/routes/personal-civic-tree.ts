import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { GetParaPersonalCivicTreeResponse } from '../../../proto/bsky_pb.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaPersonalCivicTree(req) {
    const { actorDid, limit } = req
    if (!actorDid) {
      return new GetParaPersonalCivicTreeResponse({ itemsJson: '{}' })
    }

    const maxItems = limit || 500

    // Gather communities
    const communities = await db.db
      .selectFrom('para_community_membership')
      .where('creator', '=', actorDid)
      .selectAll()
      .limit(maxItems)
      .execute()

    // Gather cabildeos
    const cabildeos = await db.db
      .selectFrom('cabildeo_cabildeo')
      .where('creator', '=', actorDid)
      .selectAll()
      .limit(maxItems)
      .execute()

    // Gather votes
    const votes = await db.db
      .selectFrom('cabildeo_vote')
      .where('creator', '=', actorDid)
      .selectAll()
      .limit(maxItems)
      .execute()

    // Gather delegations
    const delegations = await db.db
      .selectFrom('cabildeo_delegation')
      .where('creator', '=', actorDid)
      .selectAll()
      .limit(maxItems)
      .execute()

    // Gather highlights
    const highlights = await db.db
      .selectFrom('highlight_annotation')
      .where('creator', '=', actorDid)
      .selectAll()
      .limit(maxItems)
      .execute()

    const result = {
      communities,
      cabildeos,
      votes,
      delegations,
      highlights,
    }

    return new GetParaPersonalCivicTreeResponse({
      itemsJson: JSON.stringify(result),
      cursor: '',
    })
  },
})
