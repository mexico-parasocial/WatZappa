export class DelegationVerifierUnavailableError extends Error {
  name = 'DelegationVerifierUnavailableError'
}

type DelegationClaim =
  | { mode: 'active'; delegateTo: string; cabildeo: string }
  | {
      mode: 'passive'
      delegateTo: string
      party: string
      community: string
      scopeFlairs: string[]
    }

function claimFromRecord(
  record: unknown,
): (DelegationClaim & { eligibilityProofRef: string }) | null {
  if (!record || typeof record !== 'object') return null
  const value = record as Record<string, unknown>
  if (
    typeof value.delegateTo !== 'string' ||
    !value.delegateTo.startsWith('did:') ||
    typeof value.eligibilityProofRef !== 'string' ||
    !/^m8:delegation:v1:[0-9a-f-]{36}:[A-Za-z0-9_-]{43}$/.test(
      value.eligibilityProofRef,
    ) ||
    value.signal !== undefined
  )
    return null
  if (
    value.mode === 'active' &&
    typeof value.cabildeo === 'string' &&
    value.cabildeo.startsWith('at://')
  ) {
    return {
      mode: 'active',
      delegateTo: value.delegateTo,
      cabildeo: value.cabildeo,
      eligibilityProofRef: value.eligibilityProofRef,
    }
  }
  if (
    value.mode === 'passive' &&
    value.cabildeo === undefined &&
    typeof value.party === 'string' &&
    value.party.trim() &&
    typeof value.community === 'string' &&
    value.community.trim() &&
    Array.isArray(value.scopeFlairs) &&
    value.scopeFlairs.length > 0 &&
    value.scopeFlairs.every((f) => typeof f === 'string' && f.trim())
  ) {
    return {
      mode: 'passive',
      delegateTo: value.delegateTo,
      party: value.party,
      community: value.community,
      scopeFlairs: value.scopeFlairs as string[],
      eligibilityProofRef: value.eligibilityProofRef,
    }
  }
  return null
}

async function requestVerification(
  actorDid: string,
  record: unknown,
  subjectUri?: string,
  verifierUrl = process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL,
): Promise<boolean | string> {
  const claim = claimFromRecord(record)
  if (!claim) return false
  if (!verifierUrl)
    throw new DelegationVerifierUnavailableError(
      'Delegation verifier is not configured',
    )
  if (subjectUri && !process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET) {
    throw new DelegationVerifierUnavailableError(
      'Delegation resolver is not configured',
    )
  }
  try {
    const url = new URL(verifierUrl)
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
        ))
    ) {
      throw new Error('Invalid delegation verifier URL')
    }
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: {
        'content-type': 'application/json',
        ...(subjectUri
          ? {
              'x-m8-resolver-secret':
                process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET!,
            }
          : {}),
      },
      body: JSON.stringify({
        actorDid,
        ...claim,
        ...(subjectUri ? { subjectUri } : {}),
      }),
    })
    if (response.status === 422) {
      await response.body?.cancel()
      return false
    }
    if (!subjectUri && response.status === 204) return true
    if (subjectUri && response.status === 200 && response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 512) {
          await reader.cancel()
          throw new Error('Verifier response too large')
        }
        chunks.push(value)
      }
      const data = JSON.parse(
        new TextDecoder().decode(Buffer.concat(chunks)),
      ) as { voteNullifier?: unknown }
      if (
        typeof data.voteNullifier === 'string' &&
        /^[a-f0-9]{64}$/.test(data.voteNullifier)
      ) {
        return data.voteNullifier
      }
    }
    throw new Error('Unexpected delegation verification response')
  } catch {
    throw new DelegationVerifierUnavailableError(
      'Delegation verification is unavailable',
    )
  }
}

/** Refuses unverified public delegation records before PDS write or AppView index. */
export async function verifyCabildeoDelegation(
  actorDid: string,
  record: unknown,
): Promise<boolean> {
  return (await requestVerification(actorDid, record)) === true
}

/** Resolves a verified grant to the same person/cabildeo nullifier used by direct voting. */
export async function resolveCabildeoDelegationNullifier(
  actorDid: string,
  record: unknown,
  cabildeoUri: string,
): Promise<string | null> {
  const result = await requestVerification(actorDid, record, cabildeoUri)
  return typeof result === 'string' ? result : null
}
