import type { DidResolver } from '@atproto/identity'

export const LINKED_CHAT_COLLECTION = 'com.para.identity.linkedChat'

export type LinkVerdict = {
  ok: false
  reason: 'matrix-proof-required'
}

/**
 * Public ATproto records are claims, not evidence of control of a Matrix user.
 * Fail closed until a nonce-bound Matrix ownership proof and revocation exist.
 * No DID-resolved network requests are made by this authorization boundary.
 */
export async function verifyChatLink(_opts: {
  paraDid: string
  linkedDid: string
  resolver: DidResolver
  fetchImpl?: typeof fetch
}): Promise<LinkVerdict> {
  return { ok: false, reason: 'matrix-proof-required' }
}
