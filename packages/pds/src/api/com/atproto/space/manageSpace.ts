import { TID } from '@atproto/common'
import { SpaceRef } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { SimpleSpaceManager } from '../../../../simplespace/manager.js'
import { assertSpaceOwner } from './util.js'

type Policy = com.atproto.space.createSpace.$InputBody['policy']

// Only the subset already enforced by the legacy host is safe to expose.
function legacyPolicy(policy: Policy) {
  if (
    !com.atproto.memberspace.policy.$isTypeOf(policy) ||
    policy.publicRead ||
    policy.publicWrite ||
    policy.publishPolicy ||
    policy.publishMembers
  ) {
    throw new InvalidRequestError(
      'Unsupported space policy',
      'UnsupportedPolicy',
    )
  }
  const memberList = com.atproto.simplespace.defs.memberListPolicy.$build({})
  const appAccess = policy.allowedApps
    ? com.atproto.simplespace.defs.allowList.$build({
        allowed: policy.allowedApps,
      })
    : com.atproto.simplespace.defs.open.$build({})
  return { readPolicy: memberList, writePolicy: memberList, appAccess }
}

export default function (server: Server, ctx: AppContext) {
  const manager = new SimpleSpaceManager(ctx.actorStore)
  server.add(com.atproto.space.createSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {},
    }),
    handler: async ({ input: { body }, auth }) => {
      const ref = new SpaceRef(
        auth.credentials.did,
        body.spaceType,
        body.skey ?? TID.nextStr(),
      )
      auth.credentials.permissions.assertSpaceRef(ref, { manage: 'create' })
      await manager.createSpace(ref.toString(), legacyPolicy(body.policy))
      return {
        encoding: 'application/json' as const,
        body: { uri: ref.toString() },
      }
    },
  })
  server.add(com.atproto.space.getSpace, {
    auth: ctx.authVerifier.spaceAuthorization({ authorize: () => {} }),
    handler: async ({ params, auth }) => {
      assertSpaceOwner(auth, params.space, { action: 'read_self' })
      return {
        encoding: 'application/json' as const,
        body: await manager.getPolicy(params.space),
      }
    },
  })
  server.add(com.atproto.space.updateSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {},
    }),
    handler: async ({ input: { body }, auth }) => {
      assertSpaceOwner(auth, body.space, { manage: 'update' })
      await manager.updateSpace(body.space, legacyPolicy(body.policy))
    },
  })
  server.add(com.atproto.space.deleteSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {},
    }),
    handler: async ({ input: { body }, auth }) => {
      assertSpaceOwner(auth, body.space, { manage: 'delete' })
      const result = await manager.deleteSpace(body.space)
      if (result.status === 'absent') {
        throw new InvalidRequestError('Space not found', 'SpaceNotFound')
      }
      await ctx.spaceDeletionNotifications.enqueue(
        body.space,
        result.recipients,
      )
      ctx.backgroundQueue.add(() =>
        ctx.spaceDeletionNotifications.retryPending(),
      )
    },
  })
}
