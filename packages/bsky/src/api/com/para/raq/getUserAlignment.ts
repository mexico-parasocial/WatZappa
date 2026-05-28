// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.raq.getUserAlignment({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaUserAlignment({
        did: params.did,
        viewerDid: viewer ?? '',
      })

      if (!res.assessmentJson) {
        throw new InvalidRequestError('Assessment not found', 'NotFound')
      }

      let assessment: {
        results: unknown
        compass: unknown
        ideology: unknown
        secondaryIdeology?: unknown
        partyMatches?: unknown
        completedAt?: string
      }
      try {
        assessment = JSON.parse(res.assessmentJson)
      } catch {
        throw new InvalidRequestError('Assessment not found', 'NotFound')
      }

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: {
          assessment: {
            results: assessment.results || [],
            compass: assessment.compass || { x: 0, y: 0, ninth: 'center' },
            ideology: assessment.ideology || {
              name: '',
              description: '',
              matchPercent: 0,
            },
            secondaryIdeology: assessment.secondaryIdeology,
            partyMatches: assessment.partyMatches,
            completedAt: assessment.completedAt,
          },
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
