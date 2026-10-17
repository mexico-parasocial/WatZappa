import type { Config } from './config.js'
import { HttpError } from './m8-auth.js'

export type TrustedMembership = { state: 'active' | 'removed'; roles: string[] }
export type AuthorityResolver = (
  community: string,
  did: string,
) => Promise<TrustedMembership>

/** Read verified authority from the configured AppView, never from member roles. */
export function createAuthorityResolver(config: Config): AuthorityResolver {
  const origin = config.authorityAppviewUrl
  const token = config.authorityServiceToken
  if (!origin || !token || token.length < 32 || token.length > 512) {
    throw new Error(
      'BRIDGE_AUTHORITY_APPVIEW_URL and a 32–512 character PARA_AUTHORITY_SERVICE_TOKEN are required',
    )
  }
  const base = new URL(origin)
  if (
    base.username ||
    base.password ||
    (base.protocol !== 'https:' &&
      !(
        base.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
      ))
  )
    throw new Error(
      'Authority AppView must use HTTPS (HTTP is allowed only on loopback)',
    )
  return async (community, did) => {
    const url = new URL('/xrpc/com.para.community.getAuthorization', base)
    url.searchParams.set('community', community)
    url.searchParams.set('subject', did)
    url.searchParams.set('action', 'content.create')
    const res = await fetch(url, {
      headers: { 'x-para-authority-service-token': token },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok)
      throw new HttpError(503, 'Verified community authority unavailable')
    // @NOTE even compressed responses have a bounded decoded body.
    const reader = res.body?.getReader()
    if (!reader) throw new HttpError(503, 'Empty community authority response')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 16_384)
          throw new HttpError(503, 'Community authority response too large')
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      roles?: unknown
      authorization?: { policy?: string }
    }
    if (
      body.authorization?.policy !== 'verified_authority_service' ||
      !Array.isArray(body.roles) ||
      body.roles.some(
        (role) => !['member', 'moderator', 'owner'].includes(role),
      )
    ) {
      throw new HttpError(503, 'Invalid verified community authority')
    }
    const roles = [...new Set(body.roles)] as string[]
    if (!roles.includes('member') && roles.length)
      throw new HttpError(503, 'Invalid verified community membership')
    return { state: roles.includes('member') ? 'active' : 'removed', roles }
  }
}
