// @ts-nocheck
import { HOUR, MINUTE } from '@atproto/common'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { isExternalEmbedType } from '../../../../views/types.js'
import { parseDataplaneJson } from './util.js'

const LIVE_ELIGIBLE_PHASES = new Set(['open', 'deliberating', 'voting'])

export default function (server: Server, ctx: AppContext) {
  server.com.para.civic.putLivePresence({
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { cabildeo, sessionId, present = true } = input.body

      const cabildeoRes = await ctx.dataplane.getParaCabildeo({
        cabildeoUri: cabildeo,
        viewerDid: actorDid,
      })
      const cabildeoView = parseDataplaneJson<{ phase?: string } | undefined>(
        cabildeoRes.cabildeoJson,
        undefined,
      )
      const phase = cabildeoView?.phase
      if (!cabildeoView) {
        throw new InvalidRequestError('Cabildeo not found', 'NotFound')
      }
      if (!phase || !LIVE_ELIGIBLE_PHASES.has(phase)) {
        throw new InvalidRequestError(
          'Cabildeo is not live-eligible in its current phase',
          'InvalidPhase',
        )
      }

      const hostLiveUri = present
        ? await getActiveHostLiveUri(ctx, actorDid)
        : undefined

      const res = await ctx.dataplane.putParaCabildeoLivePresence({
        actorDid,
        cabildeoUri: cabildeo,
        sessionId,
        present,
        hostLiveUri: hostLiveUri ?? '',
      })

      if (present && !res.present && !hostLiveUri) {
        throw new InvalidRequestError(
          'An active live status with an external destination is required to host a live cabildeo',
          'LiveStatusRequired',
        )
      }
      if (present && !res.present) {
        throw new InvalidRequestError('Unable to update live presence')
      }

      return {
        encoding: 'application/json' as const,
        body: {
          cabildeo,
          present: res.present,
          expiresAt: res.expiresAt || undefined,
        },
      }
    },
  })
}

const getActiveHostLiveUri = async (ctx: AppContext, actorDid: string) => {
  const actors = await ctx.hydrator.actor.getActors([actorDid], {
    includeTakedowns: true,
  })
  const actor = actors.get(actorDid)
  const status = actor?.status
  if (!status || status.takedownRef) {
    return undefined
  }

  const { record, sortedAt } = status
  const minDuration = 5 * MINUTE
  const maxDuration = 4 * HOUR
  const expiresAtMs = record.durationMinutes
    ? sortedAt.getTime() +
      Math.max(
        Math.min(record.durationMinutes * MINUTE, maxDuration),
        minDuration,
      )
    : undefined

  if (expiresAtMs && expiresAtMs <= Date.now()) {
    return undefined
  }
  if (!isExternalEmbedType(record.embed)) {
    return undefined
  }
  return record.embed.external.uri
}
