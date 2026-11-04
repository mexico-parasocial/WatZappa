import { ensureValidHandle } from '@atproto/syntax'
import type { AtUriString, HandleString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import {
  appendCommunityEvent,
  createCommunityAccount,
} from '../../../../para/community/chain.js'
import { writeLocalRequest } from '../../../../para/community/requests.js'
import { prepareCreate } from '../../../../repo/index.js'
import { stripUndefined } from '../util.js'

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.create, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'create',
          collection: com.para.community.request.$type,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      if (ctx.entrywayClient) {
        throw new InvalidRequestError(
          'Communities cannot be created behind an entryway.',
        )
      }
      const founder = auth.credentials.did
      const { slug, name, description, quadrant, region } = input.body
      if (!SLUG.test(slug)) {
        throw new InvalidRequestError(
          'Use 3 to 40 lowercase letters, digits and inner hyphens.',
          'InvalidSlug',
        )
      }
      const handle =
        `${slug}${ctx.cfg.paraCommunityHandleDomain}` as HandleString
      try {
        ensureValidHandle(handle)
      } catch {
        throw new InvalidRequestError(
          'Invalid community handle.',
          'InvalidSlug',
        )
      }
      const taken = await ctx.accountManager.getAccount(handle, {
        includeTakenDown: true,
        includeDeactivated: true,
      })
      if (taken) {
        throw new InvalidRequestError(
          `Handle already taken: ${handle}`,
          'HandleNotAvailable',
        )
      }

      const did = await createCommunityAccount(ctx, handle)
      const request = await writeLocalRequest(ctx, founder, {
        community: did,
        action: 'community.found',
        subject: founder,
      })
      let profile: { uri: AtUriString; cid: string } | undefined
      await appendCommunityEvent(
        ctx,
        did,
        {
          action: 'community.found',
          actor: founder,
          subject: founder,
          request,
          // @NOTE the only settings the policy accepts until assembly
          // decisions are verifiable (OD-9 §3.7).
          settings: { governanceMode: 'hierarchical', admissionMode: 'open' },
        },
        async () => {
          const write = await prepareCreate({
            did,
            collection: com.para.community.profile.$type,
            rkey: 'self',
            record: stripUndefined({
              $type: com.para.community.profile.$type,
              name,
              description,
              quadrant,
              region,
              createdAt: new Date().toISOString(),
            }),
          })
          profile = {
            uri: write.uri.toString() as AtUriString,
            cid: write.cid.toString(),
          }
          return [write]
        },
      )
      if (!profile) throw new Error('community profile was not written')

      return {
        encoding: 'application/json' as const,
        body: { did, handle, ...profile },
      }
    },
  })
}
