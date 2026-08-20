import { randomBytes, timingSafeEqual } from 'node:crypto'

/*
 * Short-lived state for the login flow: challenges and authorization codes.
 *
 * Both are single-use and expiring, and both are consumed by *taking* them out
 * of the map rather than looking them up and deleting later — a check-then-use
 * gap is exactly where a replay lands.
 *
 * In-memory on purpose. These live for seconds, and persisting them would
 * create a store relating identity keys to login attempts — a linkage table by
 * another name, which is the thing this whole design removes. The cost is that
 * a restart invalidates in-flight logins, which is a retry, not a failure.
 *
 * The cost that is NOT acceptable is horizontal scaling: two para-idp replicas
 * do not share this map, so a code issued by one cannot be redeemed at the
 * other. Run one instance, or move to a shared store that holds only opaque
 * handles and expires them aggressively.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000
const CODE_TTL_MS = 60 * 1000

export interface LoginRequest {
  clientId: string
  redirectUri: string
  state: string
  nonce: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  createdAt: number
}

export interface AuthorizationCode {
  subject: string
  clientId: string
  redirectUri: string
  nonce: string
  codeChallenge: string
  createdAt: number
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export class LoginStore {
  private challenges = new Map<string, LoginRequest>()
  private codes = new Map<string, AuthorizationCode>()

  /** Issues a fresh single-use challenge bound to one OIDC request. */
  createChallenge(request: Omit<LoginRequest, 'createdAt'>): string {
    this.sweep()
    const challenge = randomBytes(32).toString('base64url')
    this.challenges.set(challenge, { ...request, createdAt: Date.now() })
    return challenge
  }

  /**
   * Takes a challenge, removing it. A second call with the same value returns
   * undefined — that is the replay defence, and it is why this is `take` and
   * not `get`.
   */
  takeChallenge(challenge: string): LoginRequest | undefined {
    this.sweep()
    if (typeof challenge !== 'string' || challenge.length === 0) return undefined
    // Constant-time comparison against stored keys; Map lookup would leak
    // timing on the key itself.
    for (const [key, value] of this.challenges) {
      if (constantTimeEquals(key, challenge)) {
        this.challenges.delete(key)
        return Date.now() - value.createdAt > CHALLENGE_TTL_MS ? undefined : value
      }
    }
    return undefined
  }

  createCode(code: Omit<AuthorizationCode, 'createdAt'>): string {
    this.sweep()
    const value = randomBytes(32).toString('base64url')
    this.codes.set(value, { ...code, createdAt: Date.now() })
    return value
  }

  takeCode(code: string): AuthorizationCode | undefined {
    this.sweep()
    if (typeof code !== 'string' || code.length === 0) return undefined
    for (const [key, value] of this.codes) {
      if (constantTimeEquals(key, code)) {
        this.codes.delete(key)
        return Date.now() - value.createdAt > CODE_TTL_MS ? undefined : value
      }
    }
    return undefined
  }

  private sweep(): void {
    const now = Date.now()
    for (const [key, value] of this.challenges) {
      if (now - value.createdAt > CHALLENGE_TTL_MS) this.challenges.delete(key)
    }
    for (const [key, value] of this.codes) {
      if (now - value.createdAt > CODE_TTL_MS) this.codes.delete(key)
    }
  }

  /** Test/metrics only. */
  size(): { challenges: number; codes: number } {
    return { challenges: this.challenges.size, codes: this.codes.size }
  }
}
