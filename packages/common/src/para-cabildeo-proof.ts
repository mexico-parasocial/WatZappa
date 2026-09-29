export class VoteVerifierUnavailableError extends Error {
  name = 'VoteVerifierUnavailableError'
}

/**
 * Checks m8's authorization for a public ballot: a cabildeo ballot (one option)
 * or a policy ballot (a -3..+3 signal). Both are public and attributable to
 * the repo that holds them (OD-7 §5d, PARA revocable-mandates-spec §4.0); this
 * is never a private ballot. The claim sent to m8 carries the value the MAC
 * binds, so a record rewritten to another option or signal fails.
 */
export async function verifyPublicBallotProof(
  actorDid: string,
  record: unknown,
  verifierUrl = process.env.PARA_CIVIC_VOTE_VERIFIER_URL,
): Promise<boolean> {
  const claim = publicBallotClaim(record)
  if (!claim) return false
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
      body: JSON.stringify({ actorDid, ...claim }),
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

type PublicBallotClaim =
  | {
      subjectUri: string
      selectedOption: number
      voteNullifier: string
      eligibilityProofRef: string
    }
  | {
      subjectUri: string
      signal: number
      voteNullifier: string
      eligibilityProofRef: string
    }

/** The claim m8 verifies, or null when the record is not a well-formed ballot. */
function publicBallotClaim(record: unknown): PublicBallotClaim | null {
  if (!record || typeof record !== 'object') return null
  const vote = record as Record<string, unknown>
  if (
    vote.isDirect !== true ||
    typeof vote.subject !== 'string' ||
    !vote.subject.startsWith('at://') ||
    vote.subject.length > 1024 ||
    typeof vote.voteNullifier !== 'string' ||
    !/^[a-f0-9]{64}$/.test(vote.voteNullifier) ||
    typeof vote.eligibilityProofRef !== 'string'
  ) {
    return null
  }
  const common = {
    subjectUri: vote.subject,
    voteNullifier: vote.voteNullifier,
    eligibilityProofRef: vote.eligibilityProofRef,
  }
  if (vote.subjectType === 'cabildeo') {
    if (
      vote.cabildeo !== vote.subject ||
      vote.signal !== undefined ||
      !Number.isSafeInteger(vote.selectedOption) ||
      (vote.selectedOption as number) < 0 ||
      !/^m8:cabildeo:v1:[A-Za-z0-9_-]{43}$/.test(vote.eligibilityProofRef)
    ) {
      return null
    }
    return { ...common, selectedOption: vote.selectedOption as number }
  }
  if (vote.subjectType === 'policy') {
    if (
      vote.cabildeo !== undefined ||
      vote.selectedOption !== undefined ||
      !Number.isInteger(vote.signal) ||
      (vote.signal as number) < -3 ||
      (vote.signal as number) > 3 ||
      !/^m8:policy:v1:[A-Za-z0-9_-]{43}$/.test(vote.eligibilityProofRef)
    ) {
      return null
    }
    return { ...common, signal: vote.signal as number }
  }
  return null
}
