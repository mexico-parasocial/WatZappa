import type { AtpAgent } from '@atproto/api'
import type { DidString } from '@atproto/syntax'
import type { ParaStrongRef } from './para-factory.js'

/*
 * Fixtures for OD-9 community accounts. A community is a `did:plc` account
 * created by `com.para.community.create`; everything after that is an event
 * taken through `com.para.community.act`. The generated `@atproto/api` client
 * does not carry these methods, so they are called over the agent's fetch.
 */

export type CommunityAccount = ParaStrongRef & {
  did: DidString
  handle: string
}

export type ParaCall = (
  nsid: string,
  body: Record<string, unknown>,
) => Promise<Record<string, any>>

/** Calls a procedure as whoever `headers` (or the agent's session) names. */
export const paraCall =
  (agent: AtpAgent, headers?: Record<string, string>): ParaCall =>
  async (nsid, body) => {
    const res = await agent.fetchHandler(`/xrpc/${nsid}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as Record<string, any>
    if (!res.ok) {
      throw Object.assign(
        new Error(`${nsid}: ${json.error ?? res.status}: ${json.message}`),
        { status: res.status, error: json.error as string | undefined },
      )
    }
    return json
  }

/** A slug the PDS accepts: 3 to 40 lowercase letters, digits, inner hyphens. */
export const communitySlug = (name: string): string => {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '')
  return slug.length >= 3 ? slug : `${slug}-comunidad`.replace(/^-/, '')
}

/** The URI a community account is known by: its profile record. */
export const communityUri = (did: string) =>
  `at://${did}/com.para.community.profile/self`

export const communityDidOf = (uri: string): DidString => {
  const match = /^at:\/\/(did:[^/]+)\//.exec(uri)
  if (!match) throw new Error(`Not a community URI: ${uri}`)
  return match[1] as DidString
}

/** Founds a community account; the caller becomes its owner. */
export const createCommunityAccount = async (
  call: ParaCall,
  opts: {
    name: string
    quadrant: string
    description?: string
    region?: string
    slug?: string
  },
): Promise<CommunityAccount> => {
  const base = opts.slug ?? communitySlug(opts.name)
  for (let attempt = 0; ; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`
    const slug = `${base.slice(0, 40 - suffix.length)}${suffix}`
    try {
      const res = await call('com.para.community.create', {
        slug,
        name: opts.name,
        quadrant: opts.quadrant,
        description: opts.description,
        region: opts.region,
      })
      return {
        did: res.did,
        handle: res.handle,
        uri: res.uri,
        cid: res.cid,
      }
    } catch (err) {
      if ((err as { error?: string }).error !== 'HandleNotAvailable') throw err
      if (attempt > 20) throw err
    }
  }
}

/** Takes one action in a community. */
export const actInCommunity = (
  call: ParaCall,
  community: string,
  input: Record<string, unknown>,
) =>
  call('com.para.community.act', {
    community: community.startsWith('at://')
      ? communityDidOf(community)
      : community,
    ...input,
  })

/**
 * Joins a community. A member who is already active, such as its founder, is
 * left as they are, so fixtures can join everyone without telling them apart.
 */
export const joinCommunity = async (
  call: ParaCall,
  community: string,
): Promise<void> => {
  try {
    await actInCommunity(call, community, { action: 'member.join' })
  } catch (err) {
    if ((err as { error?: string }).error !== 'InvalidSubject') throw err
  }
}
