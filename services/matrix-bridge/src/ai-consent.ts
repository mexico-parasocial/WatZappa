import type { IBridgeDatabase } from './db/index.js'

/**
 * Third-party LLM processing consent — OD-3 / F5 in docs/MATRIX_V2.md.
 *
 * Deliberation text is authored by community members and, when a summary or
 * enrichment runs, leaves our infrastructure for a third-party processor. This
 * module is the single place that decides whose text may do so.
 *
 * The rule that makes this non-obvious: a deliberation summary covers up to 100
 * cards written by many different people, and card enrichment sends up to 20
 * *other* members' cards as context. Consent therefore cannot be a property of
 * whoever calls the endpoint — it is a property of the **author of each piece of
 * text**. Gating on the caller would let one member's choice export another
 * member's words.
 *
 * Every path that sends card text to an LLM must obtain its input from
 * `filterConsentedCards`. Nothing else in the service should read
 * `getConsentingDids` directly.
 */

/**
 * Version of the disclosure the user agreed to. Bump this whenever the
 * disclosure text or the processing it describes changes materially (new
 * provider, new data categories, new retention terms). Stored consent below
 * this version stops counting and the user is asked again — consent to an old
 * disclosure is not consent to a new one.
 */
export const AI_CONSENT_POLICY_VERSION = 1

/** Minimal shape needed to attribute a piece of text to its author. */
export interface AuthoredCard {
  author_did?: string | null
  authorDid?: string | null
}

export interface ConsentFilterResult<T> {
  /** Cards whose author has live consent. Only these may be sent onward. */
  allowed: T[]
  /** How many cards were held back. Surfaced to callers for transparency. */
  withheld: number
}

function authorOf(card: AuthoredCard): string | null {
  return card.author_did ?? card.authorDid ?? null
}

/**
 * Restrict `cards` to those whose author has granted consent at the current
 * policy version.
 *
 * Fail-closed by construction: a card with no identifiable author is withheld,
 * a DID with no consent row is withheld, and a database error propagates rather
 * than being swallowed — the caller aborts and nothing is sent. There is no
 * code path where an error results in more text being transmitted.
 */
export async function filterConsentedCards<T extends AuthoredCard>(
  db: IBridgeDatabase,
  cards: T[],
): Promise<ConsentFilterResult<T>> {
  if (cards.length === 0) return { allowed: [], withheld: 0 }

  const dids = cards
    .map(authorOf)
    .filter((did): did is string => typeof did === 'string' && did.length > 0)

  const consenting = await db.getConsentingDids(dids, AI_CONSENT_POLICY_VERSION)

  const allowed = cards.filter((card) => {
    const did = authorOf(card)
    return did !== null && consenting.has(did)
  })

  return { allowed, withheld: cards.length - allowed.length }
}

/**
 * Whether a single author may have their own text processed. For paths that
 * handle exactly one card; multi-card paths must use `filterConsentedCards`.
 */
export async function hasAiConsent(
  db: IBridgeDatabase,
  did: string,
): Promise<boolean> {
  const record = await db.getAiConsent(did)
  return record.granted && record.policyVersion >= AI_CONSENT_POLICY_VERSION
}
