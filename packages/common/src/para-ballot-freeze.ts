/**
 * The PARA ballot write policy: which ballot records the services in this repo
 * will write and index, and the message explaining every refusal.
 *
 * Two rules live here, both enforced by `@atproto/pds` (`repo/prepare.ts`) on
 * write and by `@atproto/bsky` (`data-plane/server/indexing`) on index. See
 * `WatZappa/docs/OD-7-BALLOT-IDENTITY-REGISTRATION.md` §5a/§5b/§5c.
 *
 * @NOTE these are string literals rather than generated `$type` constants
 * because this package has no lexicon codegen. `packages/pds/tests/ballot-freeze.test.ts`
 * pins them against the generated schemas so a rename cannot silently thaw one.
 */

/**
 * Frozen outright. Both were marked DEPRECATED in their lexicons on 2026-09-18,
 * but a lexicon description is not a control — the PDS still accepted a ballot
 * carrying `voter` and `signal` into the author's own repo, signed by their DID
 * and sequenced to the firehose permanently.
 */
export const FROZEN_BALLOT_COLLECTIONS = Object.freeze([
  'com.para.community.vote',
  'com.para.community.intensity',
] as const)

export type FrozenBallotCollection = (typeof FROZEN_BALLOT_COLLECTIONS)[number]

const FROZEN_SET: ReadonlySet<string> = new Set(FROZEN_BALLOT_COLLECTIONS)

export function isFrozenBallotCollection(
  collection: string,
): collection is FrozenBallotCollection {
  return FROZEN_SET.has(collection)
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
      `${collection} is frozen and will not be written: DEPRECATED 2026-09-18 (ballot freeze E0). ` +
      `Both \`voter\` and \`signal\` are required and the record lands in the author's own public repo, ` +
      `so the ballot is published to the firehose permanently and cannot be unpublished. ` +
      `Deleting existing records is still allowed. See ${DOCS} §5a/§5b for the replacement.`
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
