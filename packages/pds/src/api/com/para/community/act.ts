import {
  type CommunityProfile,
  type CommunitySanction,
  isCommunityAction,
} from '@atproto/common'
import { parseCid } from '@atproto/lex-data'
import { AtUri, type DidString } from '@atproto/syntax'
import {
  AuthRequiredError,
  InvalidRequestError,
  type Server,
} from '@atproto/xrpc-server'
import type { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { communityActAuth } from '../../../../para/community/auth.js'
import { appendCommunityEvent } from '../../../../para/community/chain.js'
import {
  type ProvenRequest,
  proveRequest,
  writeLocalRequest,
} from '../../../../para/community/requests.js'
import { prepareUpdate } from '../../../../repo/index.js'
import { stripUndefined } from '../util.js'

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
        profile: body.profile ? cleanProfile(body.profile) : undefined,
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

      const profile = fields.profile
      const result = await appendCommunityEvent(
        ctx,
        community,
        {
          action,
          actor,
          subject,
          request,
          offer: body.offer,
          suspensionDays: body.suspensionDays,
          sanction,
          target: body.target,
          targetCid: body.targetCid,
          profile,
        },
        // The profile record changes in the commit that appends the event, so
        // the two cannot disagree about who changed it.
        async (_seq, txn) => {
          if (action !== 'profile.update' || !profile) return []
          const uri = AtUri.make(
            community,
            com.para.community.profile.$type,
            'self',
          )
          const current = await txn.record.getRecord(uri, null)
          if (!current) {
            throw new InvalidRequestError(
              'The community has no profile.',
              'CommunityNotFound',
            )
          }
          // The event carries the banner's CID; the record carries the blob,
          // which must already be in this community's store.
          const banner = profile.banner
            ? await bannerBlob(txn, profile.banner)
            : undefined
          return [
            await prepareUpdate({
              did: community,
              collection: com.para.community.profile.$type,
              rkey: 'self',
              swapCid: parseCid(current.cid),
              record: stripUndefined({
                $type: com.para.community.profile.$type,
                ...profile,
                banner,
                createdAt: current.value.createdAt,
              }),
            }),
          ]
        },
      )
      return { encoding: 'application/json' as const, body: result }
    },
  })
}

/** Drops absent fields, so the request, the event and the record agree. */
const cleanProfile = (profile: CommunityProfile): CommunityProfile =>
  stripUndefined({
    name: profile.name,
    description: profile.description,
    quadrant: profile.quadrant,
    region: profile.region,
    banner: profile.banner,
  }) as unknown as CommunityProfile

/** The stored image a `profile.update` names, as the record's blob field. */
async function bannerBlob(txn: ActorStoreTransactor, cid: string) {
  const ref = parseCid(cid)
  const metadata = await txn.repo.blob.getBlobMetadata(ref).catch(() => null)
  if (!metadata?.mimeType) {
    throw new InvalidRequestError(
      'Upload the banner to this community first.',
      'InvalidRequest',
    )
  }
  return {
    $type: 'blob' as const,
    ref,
    mimeType: metadata.mimeType,
    size: metadata.size,
  }
}

const isSanction = (value: unknown): value is CommunitySanction =>
  value === 'remove' || value === 'block'

async function isHostedCommunity(ctx: AppContext, did: DidString) {
  if (!(await ctx.accountManager.getAccount(did))) return false
  return ctx.actorStore.read(did, (store) => store.community.isCommunity())
}
