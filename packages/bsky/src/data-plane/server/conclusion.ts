/*
 * Rules for conclusions: a steward's written summary of a deliberation that has
 * no vote to end it. Kept free of the database so they can be tested alone.
 */

/** Kinds of cabildeo that end without a winning option. */
const CONCLUDABLE_KINDS = ['forum', 'persuasion']

export const MAX_CITED = 10

export type ConcludableCabildeo = {
  kind: string | null
  phase: string
}

/**
 * A conclusion is served only for a forum or persuasion cabildeo that has left
 * draft, and only when its view tier is public or unset. Tier-aware visibility
 * is a later step, as it is for Seguimiento. An `activity` cabildeo ends in a
 * vote and an outcome, so it never has a conclusion.
 */
export function isConcludable(
  cabildeo: ConcludableCabildeo,
  minimumViewTier: string | undefined,
): boolean {
  if (!CONCLUDABLE_KINDS.includes(cabildeo.kind ?? 'activity')) return false
  if (cabildeo.phase === 'draft') return false
  return minimumViewTier === undefined || minimumViewTier === 'public'
}

export type ConclusionRow = {
  uri: string
  createdAt: string
}

/**
 * The newest conclusion is shown and the rest are kept as history, newest
 * first. A correction is a new conclusion; the old one is never rewritten.
 */
export function pickConclusions<T extends ConclusionRow>(
  rows: readonly T[],
): { current: T | undefined; earlier: T[] } {
  const ordered = [...rows].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      (a.uri < b.uri ? 1 : -1),
  )
  return { current: ordered[0], earlier: ordered.slice(1) }
}
