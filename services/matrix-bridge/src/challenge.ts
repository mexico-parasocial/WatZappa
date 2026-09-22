import { randomBytes } from 'node:crypto'

/**
 * One-time challenges binding a proof of possession to an M8 session.
 *
 * CD-M4 assertions are signatures over (purpose, audience, identityPub,
 * challenge, signedAt). Without a server-issued challenge the signature is a
 * replayable bearer proof — anyone who captured one presentation of the key
 * could reuse it forever. The challenge is issued to an authenticated DID and
 * consumed exactly once, so the assertion is bound to a live session.
 *
 * In memory on purpose: a DID→challenge row in the database would be state an
 * operator could mine for identity correlations, for no benefit — an
 * unanswered challenge proves nothing and expires in minutes. Restart clears
 * them; clients simply request a fresh one.
 */
export class ChallengeStore {
  private pending = new Map<string, { did: string; expiresAt: number }>()
  private readonly ttlMs: number

  constructor(ttlMs = 5 * 60_000) {
    this.ttlMs = ttlMs
  }

  issue(did: string): { challenge: string; expiresAt: string } {
    this.sweep()
    const challenge = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + this.ttlMs
    this.pending.set(challenge, { did, expiresAt })
    return { challenge, expiresAt: new Date(expiresAt).toISOString() }
  }

  /**
   * Single-use consumption. The challenge must exist, be unexpired, and have
   * been issued to the same DID that is now presenting the assertion —
   * otherwise a challenge minted inside one session could be paired with a
   * proof from another.
   */
  consume(challenge: string, did: string): boolean {
    const entry = this.pending.get(challenge)
    if (!entry) return false
    this.pending.delete(challenge)
    if (entry.did !== did) return false
    if (Date.now() > entry.expiresAt) return false
    return true
  }

  private sweep(): void {
    const now = Date.now()
    for (const [challenge, entry] of this.pending) {
      if (entry.expiresAt < now) this.pending.delete(challenge)
    }
  }

  /** Clear everything (tests, shutdown). */
  close(): void {
    this.pending.clear()
  }
}
