// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listDelegations({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaDelegations({
        delegator: params.delegator ?? '',
        delegate: params.delegate ?? '',
        community: params.community ?? '',
        limit: params.limit,
        cursor: params.cursor ?? '',
      })

      const delegations = parseDataplaneJson<DelegationRow[]>(res.itemsJson, [])

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          delegations: delegations.map((d) => ({
            uri: d.uri,
            cid: d.cid,
            delegate: d.delegate,
            delegator: d.delegator,
            delegateRole: d.delegateRole ?? undefined,
            party: d.party ?? undefined,
            scope: {
              mode: d.scopeMode,
              community: d.scopeCommunity ?? undefined,
              topic: d.scopeTopic ?? undefined,
              proposal: d.scopeProposal ?? undefined,
            },
            expiresAt: d.expiresAt ?? undefined,
            revokedAt: d.revokedAt ?? undefined,
            createdAt: d.createdAt,
          })),
          cursor: res.cursor || undefined,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

interface DelegationRow {
  uri: string
  cid: string
  delegate: string
  delegator: string
  delegateRole: string | null
  party: string | null
  scopeMode: string
  scopeCommunity: string | null
  scopeTopic: string | null
  scopeProposal: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
