// Avoid having to explicitly depend sub dependencies
export * from '@atproto-labs/fetch'
export * from '@atproto-labs/fetch-node'
export * from '@atproto/jwk'
export * from '@atproto/jwk-jose'
export * from '@atproto/oauth-types'

// `Awaitable` reaches this barrel through both ./oauth-hooks.js and
// ./oauth-store.js. They are the same type from ./lib/util/type.js, but a
// star-export cannot disambiguate that, so name it explicitly.
export type { Awaitable } from './lib/util/type.js'

export * from './oauth-constants.js'
export * from './oauth-client.js'
export * from './oauth-dpop.js'
export * from './oauth-errors.js'
export * from './oauth-hooks.js'
export * from './oauth-middleware.js'
export * from './oauth-provider.js'
export * from './oauth-store.js'
export * from './oauth-verifier.js'
