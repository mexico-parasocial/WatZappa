export class VoteVerifierUnavailableError extends Error {
  name = 'VoteVerifierUnavailableError'
}

/** Checks authorization for the public cabildeo path, never a private ballot. */
export async function verifyCabildeoProof(
  actorDid: string,
  record: unknown,
  verifierUrl = process.env.PARA_CIVIC_VOTE_VERIFIER_URL,
): Promise<boolean> {
  if (!record || typeof record !== 'object') return false
  const vote = record as Record<string, unknown>
  if (
    vote.subjectType !== 'cabildeo' ||
    typeof vote.cabildeo !== 'string' ||
    !vote.cabildeo.startsWith('at://') ||
    vote.cabildeo.length > 1024 ||
    vote.subject !== vote.cabildeo ||
    vote.isDirect !== true ||
    !Number.isSafeInteger(vote.selectedOption) ||
    (vote.selectedOption as number) < 0 ||
    typeof vote.voteNullifier !== 'string' ||
    !/^[a-f0-9]{64}$/.test(vote.voteNullifier) ||
    typeof vote.eligibilityProofRef !== 'string' ||
    !/^m8:cabildeo:v1:[A-Za-z0-9_-]{43}$/.test(vote.eligibilityProofRef)
  ) {
    return false
  }
  if (!verifierUrl) {
    throw new VoteVerifierUnavailableError(
      'Civic vote verifier is not configured',
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
      throw new Error('Invalid verifier URL')
    }
    // @NOTE only operator configuration supplies the URL. Never follow a
    // redirect or forward an account/session credential to this verifier.
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorDid,
        subjectUri: vote.cabildeo,
        selectedOption: vote.selectedOption,
        voteNullifier: vote.voteNullifier,
        eligibilityProofRef: vote.eligibilityProofRef,
      }),
    })
    // @NOTE the response contract is status-only; never buffer remote bodies.
    await response.body?.cancel()
    if (response.status === 204) return true
    if (response.status === 422) return false
    throw new Error('Unexpected verification status')
  } catch {
    throw new VoteVerifierUnavailableError(
      'Civic vote verification is unavailable',
    )
  }
}
