/**
 * The PARA ballot write policy: which ballot records the services in this repo
 * will write and index, and the message explaining every refusal.
 *
 * Every ballot-shaped record lands in its author's own public repo, signed by
 * their DID. So each one falls in exactly one of three boxes (OD-7 §5h):
 *
 * 1. It publishes a magnitude (a -3..+3 position) or the delegation graph:
 *    FROZEN until a private ballot exists. Refused on write and on index.
 * 2. Its count decides something: REDEMPTION REQUIRED, a valid m8
 *    authorization checked fail-closed (`para-cabildeo-proof.ts`). Only the
 *    cabildeo ballot is here today.
 * 3. Its count decides nothing: a PUBLIC REACTION, deduplicated per account and
 *    carrying no m8 proof. Asking m8 for a nullifier makes the issuer store a
 *    durable (person, subject) row; for a vote that decides nothing that is a
 *    privacy cost bought for no integrity at all.
 *
 * `ballotWriteRefusal` is enforced by `@atproto/pds` (`repo/prepare.ts`) on
 * write and by `@atproto/bsky` (`data-plane/server/indexing`) on index.
 * `reactionWriteRefusal` is enforced on write only; see its comment for why.
 * See `WatZappa/docs/OD-7-BALLOT-IDENTITY-REGISTRATION.md` §5a/§5b/§5c/§5h.
 *
 * @NOTE these are string literals rather than generated `$type` constants
 * because this package has no lexicon codegen. `packages/pds/tests/ballot-freeze.test.ts`
 * pins them against the generated schemas so a rename cannot silently thaw one.
 */

/**
 * Frozen outright (box 1). The first two were marked DEPRECATED in their
 * lexicons on 2026-09-18, but a lexicon description is not a control — the PDS
 * still accepted a ballot carrying `voter` and `signal` into the author's own
 * repo, signed by their DID and sequenced to the firehose permanently.
 */
export const FROZEN_BALLOT_COLLECTIONS = Object.freeze([
  'com.para.community.vote',
  'com.para.community.intensity',
  'com.para.raq.proposalAnswer',
  'com.para.community.civicTreeVote',
] as const)

export type FrozenBallotCollection = (typeof FROZEN_BALLOT_COLLECTIONS)[number]

const FROZEN_SET: ReadonlySet<string> = new Set(FROZEN_BALLOT_COLLECTIONS)

export function isFrozenBallotCollection(
  collection: string,
): collection is FrozenBallotCollection {
  return FROZEN_SET.has(collection)
}

const FROZEN_REASONS: Record<FrozenBallotCollection, string> = {
  'com.para.community.vote':
    'DEPRECATED 2026-09-18 (ballot freeze E0). Both `voter` and `signal` are required',
  'com.para.community.intensity':
    'DEPRECATED 2026-09-18 (ballot freeze E0). Both `voter` and `signal` are required',
  'com.para.raq.proposalAnswer':
    'its `value` is a -3..+3 answer, from strongly disagree to strongly agree, which is a signal under another name',
  'com.para.community.civicTreeVote':
    'nothing writes it any more (superseded by `com.para.community.deliberationVote`), and its `direction` is a stance on an argument',
}

/**
 * Not frozen, but narrowed to the one shape whose publicness has been accepted:
 * a cabildeo ballot. The record lands in the voter's own public repo either way,
 * so a `policy` ballot here would publish a -3..+3 signal, and `delegatedFrom`
 * would publish the delegation graph (§5b names it as more re-identifying than
 * the ballots themselves). Those need the replacement ballot, not this record.
 */
export const CABILDEO_BALLOT_COLLECTION = 'com.para.civic.vote'

const DOCS = 'WatZappa/docs/OD-7-BALLOT-IDENTITY-REGISTRATION.md'

/**
 * The refusal reason for a ballot write, or undefined when the write is allowed.
 * Shape rules read the record defensively: anything this does not recognise is
 * refused rather than waved through.
 */
export function ballotWriteRefusal(
  collection: string,
  record: unknown,
): string | undefined {
  if (isFrozenBallotCollection(collection)) {
    return (
      `${collection} is frozen and will not be written: ${FROZEN_REASONS[collection]}, ` +
      `and the record lands in the author's own public repo, ` +
      `so the ballot is published to the firehose permanently and cannot be unpublished. ` +
      `Deleting existing records is still allowed. See ${DOCS} §5a/§5b/§5h for the replacement.`
    )
  }

  if (
    collection === 'com.para.civic.delegation' &&
    typeof record === 'object' &&
    record !== null &&
    'signal' in record &&
    record.signal !== undefined
  ) {
    return `${collection} cannot publish a signal: the private ballot replacement is required. See ${DOCS} §5b.`
  }

  if (collection === CABILDEO_BALLOT_COLLECTION) {
    const refusal = cabildeoBallotRefusal(record)
    if (refusal) {
      return (
        `${collection} is accepted only as a cabildeo ballot, and this one is not: ${refusal}. ` +
        `The record is written to the voter's own public repo and signed by their DID, so it is permanently ` +
        `attributable to them. That is accepted for cabildeo votes and only for those (${DOCS} §5c); ` +
        `a signal ballot or a named delegation needs the replacement ballot (§5a/§5b), not this record.`
      )
    }
  }

  return undefined
}

function cabildeoBallotRefusal(record: unknown): string | undefined {
  if (typeof record !== 'object' || record === null) {
    return 'the record is not an object'
  }
  const { subjectType, selectedOption, signal, delegatedFrom } = record as {
    subjectType?: unknown
    selectedOption?: unknown
    signal?: unknown
    delegatedFrom?: unknown
  }
  if (subjectType !== 'cabildeo') {
    return `\`subjectType\` is ${JSON.stringify(subjectType)} rather than "cabildeo"`
  }
  if (!Number.isInteger(selectedOption)) {
    return '`selectedOption` is missing or not an integer'
  }
  if (signal !== undefined) {
    return '`signal` is set, which publishes a -3..+3 position'
  }
  if (Array.isArray(delegatedFrom) && delegatedFrom.length > 0) {
    return '`delegatedFrom` is set, which publishes the delegation graph'
  }
  return undefined
}

/**
 * Public reactions (box 3): votes whose count is only displayed. None of them
 * passes, promotes or ranks anything.
 */
export const REACTION_COLLECTIONS = Object.freeze([
  'com.para.civic.openQuestionVote',
  'com.para.raq.proposalVote',
  'com.para.raq.axisVote',
] as const)

export type ReactionCollection = (typeof REACTION_COLLECTIONS)[number]

const REACTION_SET: ReadonlySet<string> = new Set(REACTION_COLLECTIONS)

export function isReactionCollection(
  collection: string,
): collection is ReactionCollection {
  return REACTION_SET.has(collection)
}

/**
 * The refusal reason for writing a reaction that carries m8 proof fields, or
 * undefined when the write is allowed.
 *
 * This refuses only on write. Before this decision the client asked m8 for a
 * proof on every reaction, so every historical reaction carries one. Refusing
 * them at index time would erase that history on the next backfill and win
 * nothing, because the privacy cost was paid at issuance. What matters is that
 * no new reaction asks m8 again, and a write-side refusal is what keeps an old
 * or modified client from doing so.
 */
export function reactionWriteRefusal(
  collection: string,
  record: unknown,
): string | undefined {
  if (!isReactionCollection(collection)) return undefined
  if (typeof record !== 'object' || record === null) return undefined
  const { voteNullifier, eligibilityProofRef } = record as {
    voteNullifier?: unknown
    eligibilityProofRef?: unknown
  }
  if (voteNullifier === undefined && eligibilityProofRef === undefined) {
    return undefined
  }
  return (
    `${collection} is a public reaction and must not carry \`voteNullifier\` or \`eligibilityProofRef\`: ` +
    `its count decides nothing, so an m8 proof buys no integrity, and issuing one makes m8 store ` +
    `which subject this person reacted to. Write the reaction without them. See ${DOCS} §5h.`
  )
}
