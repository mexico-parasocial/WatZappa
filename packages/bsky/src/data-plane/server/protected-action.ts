import { type DidString, isDidString } from '@atproto/lex-schema'

/**
 * The `protectedAction` claim of a `com.para.civic.cabildeo` record: what the
 * cabildeo asks its assembly to decide. Anything malformed reads as no claim.
 * A claim carries no authority; `verifyAuthorityEvent` decides what a resolved
 * cabildeo may ground.
 */
export type ProtectedActionClaim = {
  action: string
  subject: DidString
  payloadHash?: string
}

export function readProtectedAction(
  value: unknown,
): ProtectedActionClaim | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { action, subject, payloadHash } = value as Record<string, unknown>
  if (typeof action !== 'string' || !isDidString(subject)) return undefined
  return {
    action,
    subject,
    ...(typeof payloadHash === 'string' ? { payloadHash } : {}),
  }
}
