/** A community account is known by its profile record (OD-9). */
export const communityProfileUri = (did: string) =>
  `at://${did}/com.para.community.profile/self`

/** The room-alias localpart of a community account: its DID, made alias-safe. */
export const communityAlias = (did: string) =>
  did
    .replace(/^did:[a-z0-9]+:/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** The DID a community account's profile URI names, or `null`. */
export const communityDidOf = (uri: string): string | null =>
  /^at:\/\/(did:[a-z0-9]+:[a-zA-Z0-9._:%-]+)\/com\.para\.community\.profile\/self$/.exec(
    uri,
  )?.[1] ?? null
