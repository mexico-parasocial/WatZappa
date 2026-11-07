import type { IncomingMessage } from 'node:http'
import { getVerificationMaterial } from '@atproto/common'
import { getDidKeyFromMultibase } from '@atproto/identity'
import type { DidString } from '@atproto/syntax'
import {
  AuthRequiredError,
  type MethodAuthVerifier,
  parseReqNsid,
  verifyJwt,
} from '@atproto/xrpc-server'
import { bearerTokenFromReq } from '../../auth-verifier.js'
import type { AppContext } from '../../context.js'
import { com } from '../../lexicons/index.js'

export type CommunityActCredentials =
  | { type: 'local'; did: DidString }
  | { type: 'community_service_auth'; did: DidString; aud: DidString }

/**
 * Auth for `com.para.community.act` (OD-9 §3.3): this PDS's own session or
 * OAuth tokens for its accounts, or a service JWT from a member elsewhere.
 * atproto-proxy sends that JWT with the community's bare DID as `aud`, which
 * the stock verifier refuses (it accepts only this PDS's DID). The handler
 * must check that `aud` is the community named in the body.
 */
export function communityActAuth(
  ctx: AppContext,
): MethodAuthVerifier<{ credentials: CommunityActCredentials }> {
  const local = ctx.authVerifier.authorization({
    authorize: (permissions) => {
      permissions.assertRepo({
        action: 'create',
        collection: com.para.community.request.$type,
      })
    },
  })
  return async (reqCtx) => {
    if (isServiceJwt(reqCtx.req)) {
      return { credentials: await verifyCommunityServiceJwt(ctx, reqCtx.req) }
    }
    const result = await local(reqCtx)
    if (!('credentials' in result)) return result
    return { credentials: { type: 'local', did: result.credentials.did } }
  }
}

async function verifyCommunityServiceJwt(
  ctx: AppContext,
  req: IncomingMessage,
): Promise<CommunityActCredentials> {
  const jwtStr = bearerTokenFromReq(req)
  if (!jwtStr) throw new AuthRequiredError('missing jwt', 'MissingJwt')
  if (parseReqNsid(req) !== com.para.community.act.$lxm) {
    throw new AuthRequiredError('Bad token method', 'BadJwtLexiconMethod')
  }
  // Audience is checked against the community below and in the handler.
  const payload = await verifyJwt(
    jwtStr,
    null,
    com.para.community.act.$lxm,
    async (iss, forceRefresh) => {
      if (iss.includes('#')) {
        throw new AuthRequiredError('Untrusted issuer', 'UntrustedIss')
      }
      const doc = await ctx.idResolver.did.resolve(iss, forceRefresh)
      const key = doc && getVerificationMaterial(doc, 'atproto')
      const didKey = key && getDidKeyFromMultibase(key)
      if (!didKey) throw new AuthRequiredError('missing or bad key in did doc')
      return didKey
    },
  )
  if (!payload.lxm) {
    throw new AuthRequiredError(
      'missing jwt lexicon method',
      'BadJwtLexiconMethod',
    )
  }
  return {
    type: 'community_service_auth',
    did: payload.iss as DidString,
    aud: payload.aud as DidString,
  }
}

function isServiceJwt(req: IncomingMessage): boolean {
  const token = bearerTokenFromReq(req)
  if (!token) return false
  try {
    const [, body] = token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    return payload?.lxm != null
  } catch {
    return false
  }
}
