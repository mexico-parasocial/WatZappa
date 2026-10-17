import { timingSafeEqual } from 'node:crypto'
import { AuthRequiredError } from '@atproto/xrpc-server'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add<
    typeof com.para.community.getAuthorization.main,
    Awaited<ReturnType<typeof ctx.authVerifier.optionalStandardOrRole>>
  >(com.para.community.getAuthorization, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const credential = req.headers['x-para-authority-service-token']
      const subject = resolveAuthoritySubject(
        viewer ?? undefined,
        params.subject,
        credential,
        ctx.cfg.paraAuthorityServiceToken,
      )
      const result = await ctx.dataplane.getParaCommunityAuthorization({
        community: params.community,
        action: params.action,
        subject: params.subject ?? '',
        viewerDid: subject ?? '',
      })
      const authorization = result.authorization
      return {
        encoding: 'application/json',
        headers: {
          'Cache-Control': 'no-store',
          Vary: 'Authorization, x-para-authority-service-token',
        },
        body: {
          roles: result.roles as ('member' | 'moderator' | 'owner')[],
          capabilities: result.capabilities,
          authorization: com.para.community.defs.availableAction.parse({
            action: authorization?.action || params.action,
            status: (authorization?.status || 'denied') as
              'allowed' | 'requires_approval' | 'denied',
            policy:
              credential !== undefined
                ? 'verified_authority_service'
                : authorization?.policy || 'role_required',
            reason: authorization?.reason || undefined,
            evidence: authorization?.evidence || undefined,
          }),
        },
      }
    },
  })
}

/** Only the scoped bridge credential can resolve another member's authority. */
export function resolveAuthoritySubject(
  viewer: string | undefined,
  subject: string | undefined,
  credential: string | string[] | undefined,
  expected: string | undefined,
): string | undefined {
  if (credential === undefined) return viewer
  if (
    typeof credential !== 'string' ||
    !expected ||
    expected.length < 32 ||
    credential.length > 512
  )
    throw new AuthRequiredError('Invalid authority service credential')
  const provided = Buffer.from(credential)
  const configured = Buffer.from(expected)
  if (
    provided.length !== configured.length ||
    !timingSafeEqual(provided, configured) ||
    !subject
  )
    throw new AuthRequiredError('Invalid authority service credential')
  return subject
}
