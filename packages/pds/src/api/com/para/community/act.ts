import { type CommunitySanction, isCommunityAction } from '@atproto/common'
import type { DidString } from '@atproto/syntax'
import {
  AuthRequiredError,
  InvalidRequestError,
  type Server,
} from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { communityActAuth } from '../../../../para/community/auth.js'
import { appendCommunityEvent } from '../../../../para/community/chain.js'
import {
  type ProvenRequest,
  proveRequest,
  writeLocalRequest,
} from '../../../../para/community/requests.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.act, {
    auth: communityActAuth(ctx),
    handler: async ({ input, auth }) => {
      const { credentials } = auth
      const body = input.body
      const actor = credentials.did
      const community = body.community
      if (
        credentials.type === 'community_service_auth' &&
        credentials.aud !== community
      ) {
        throw new AuthRequiredError(
          'jwt audience does not match the community',
          'BadJwtAudience',
        )
      }
      const action = body.action
      if (!isCommunityAction(action) || action === 'community.found') {
        throw new InvalidRequestError(`Unknown action: ${action}`)
      }
      if (!(await isHostedCommunity(ctx, community))) {
        throw new InvalidRequestError(
          'This PDS hosts no such community.',
          'CommunityNotFound',
        )
      }

      const sanction = body.sanction
      if (sanction !== undefined && !isSanction(sanction)) {
        throw new InvalidRequestError(`Unknown sanction: ${sanction}`)
      }
      const subject = body.subject ?? actor
      const fields = {
        community,
        action,
        subject,
        offer: body.offer,
        suspensionDays: body.suspensionDays,
        sanction,
        target: body.target,
        targetCid: body.targetCid,
      }
      let request: ProvenRequest
      if (body.request) {
        request = await proveRequest(ctx, actor, {
          uri: body.request.uri,
          cid: body.request.cid,
        })
      } else if (credentials.type === 'local') {
        request = await writeLocalRequest(ctx, actor, fields)
      } else {
        throw new InvalidRequestError(
          'Callers on other PDSes must reference their own request.',
          'InvalidRequest',
        )
      }

      const result = await appendCommunityEvent(ctx, community, {
        action,
        actor,
        subject,
        request,
        offer: body.offer,
        suspensionDays: body.suspensionDays,
        sanction,
        target: body.target,
        targetCid: body.targetCid,
      })
      return { encoding: 'application/json' as const, body: result }
    },
  })
}

const isSanction = (value: unknown): value is CommunitySanction =>
  value === 'remove' || value === 'block'

async function isHostedCommunity(ctx: AppContext, did: DidString) {
  if (!(await ctx.accountManager.getAccount(did))) return false
  return ctx.actorStore.read(did, (store) => store.community.isCommunity())
}
