import { DidResolver } from '@atproto/identity'

/**
 * Verifies a two-account chat link: the PARA repo declares the external
 * Matrix identity, and the linked account's repo carries the reciprocal
 * record naming the PARA DID. Both records must exist and point at each
 * other — a one-sided record is a claim, not a link.
 *
 * Resolution reads records straight from each account's PDS via its DID
 * document (no AppView involvement); the fetch function should be the
 * caller's SSRF-safe fetch (ctx.safeFetch semantics on the PDS; in the
 * bridge use a restricted fetch).
 */

export type LinkedChatRecord = {
  provider: string
  matrixUserId: string
  paraDid?: string
  linkedAt: string
}

export type LinkVerdict =
  | { ok: true; provider: string; matrixUserId: string }
  | {
      ok: false
      reason: 'no-para-record' | 'no-reciprocal-record' | 'mismatch'
    }

const COLLECTION = 'com.para.identity.linkedChat'

async function readRecords(
  resolver: DidResolver,
  did: string,
  fetchImpl: typeof fetch,
): Promise<LinkedChatRecord[]> {
  const didDoc = await resolver.resolve(did)
  const pds = didDoc?.service?.find(
    (s) => s.id === '#atproto_pds',
  )?.serviceEndpoint
  if (!pds) return []
  const url = new URL(
    `${String(pds).replace(/\/$/, '')}/xrpc/com.atproto.repo.listRecords`,
  )
  url.searchParams.set('repo', did)
  url.searchParams.set('collection', COLLECTION)
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return []
  const body = (await res.json()) as { records?: Array<{ value: unknown }> }
  const out: LinkedChatRecord[] = []
  for (const r of body.records ?? []) {
    const v = r.value as Partial<LinkedChatRecord> | null
    if (
      v &&
      typeof v.provider === 'string' &&
      typeof v.matrixUserId === 'string' &&
      typeof v.linkedAt === 'string'
    ) {
      out.push({
        provider: v.provider,
        matrixUserId: v.matrixUserId,
        paraDid: typeof v.paraDid === 'string' ? v.paraDid : undefined,
        linkedAt: v.linkedAt,
      })
    }
  }
  return out
}

export async function verifyChatLink(opts: {
  paraDid: string
  linkedDid: string
  resolver: DidResolver
  fetchImpl?: typeof fetch
}): Promise<LinkVerdict> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const mine = await readRecords(opts.resolver, opts.paraDid, fetchImpl)
  if (mine.length === 0) return { ok: false, reason: 'no-para-record' }

  const theirs = await readRecords(opts.resolver, opts.linkedDid, fetchImpl)
  // Reciprocity: one of their records must name this PARA DID, and one of
  // mine must name an mxid on the provider their record lives under.
  for (const their of theirs) {
    if (their.paraDid !== opts.paraDid) continue
    const match = mine.find((m) => m.provider === their.provider)
    if (match) {
      return {
        ok: true,
        provider: match.provider,
        matrixUserId: match.matrixUserId,
      }
    }
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: false, reason: 'no-reciprocal-record' }
}

export { COLLECTION as LINKED_CHAT_COLLECTION }
