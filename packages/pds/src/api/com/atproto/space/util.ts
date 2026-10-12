import type { Keypair } from '@atproto/crypto'
import type { SpacePermissionMatchOperation } from '@atproto/oauth-scopes'
import { type CommitCtx, RepoCommit, type SignedCommit } from '@atproto/space'
import {
  type DidString,
  InvalidRecordKeyError,
  SpaceRef,
  type SpaceRefString,
} from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { SpaceRepo } from '../../../../actor-store/db/index.js'
import type { OAuthOutput } from '../../../../auth-output.js'
import { InvalidRecordError } from '../../../../repo/index.js'

/*
 * atproto Spaces, ported from the reference PDS (see packages/space/SOURCE for
 * the commit): an account's own space repos, and a simplespace host for the
 * spaces it owns (../simplespace). No space credentials, no members besides the
 * owner, no write notifications yet. Every Spaces method without a handler here answers
 * 501 from pipethrough.ts, never proxied.
 */

// Lexicons type a space as a `space-ref`, so schema validation rejects a
// malformed one before any handler runs. Defensive for other callers.
export function toSpaceRef(spaceUri: SpaceRefString): SpaceRef {
  try {
    return SpaceRef.parse(spaceUri)
  } catch (cause) {
    throw new InvalidRequestError(
      `Not a space uri: ${spaceUri}`,
      'InvalidSpaceUri',
      { cause },
    )
  }
}

/**
 * Writes are accepted only into a space the writer governs (its DID is the
 * space's authority). A write into another authority's space has to be
 * announced to that authority (`space.notifyWrite`), which this server does not
 * do yet; accepting it silently would leave the record outside the space as the
 * authority sees it.
 */
export function assertOwnSpace(space: SpaceRefString, did: DidString): void {
  if (toSpaceRef(space).spaceDid !== did) {
    throw new InvalidRequestError(
      'Only spaces this account governs are supported on this server yet',
      'SpaceNotSupported',
    )
  }
}

// A simplespace space is anchored on its authority's own DID, so ownership is a
// comparison against the space URI.
export function assertSpaceOwner(
  auth: OAuthOutput,
  space: SpaceRefString,
  op: SpacePermissionMatchOperation,
): void {
  const ref = toSpaceRef(space)
  auth.credentials.permissions.assertSpaceRef(ref, op)
  if (ref.spaceDid !== auth.credentials.did) {
    throw new InvalidRequestError('Not the space owner', 'NotSpaceOwner')
  }
}

/**
 * An account reads only its own repo in a space. Reading another member's repo
 * takes a space credential, which this server does not accept yet.
 */
export function assertSpaceSelfRead(
  auth: OAuthOutput,
  spaceUri: SpaceRefString,
  repo: string,
): void {
  if (auth.credentials.did !== repo) {
    // Deliberately the same error an absent repo gets: whether a given account
    // holds a repo in a space the caller cannot read is not the caller's business.
    throw new InvalidRequestError(
      `Could not find repo for DID: ${repo}`,
      'RepoNotFound',
    )
  }
  auth.credentials.permissions.assertSpaceRef(spaceUri, {
    action: 'read_self',
  })
}

/**
 * Preparing a write throws plain errors for a bad record or record key; the
 * public repo handlers turn them into 400s, and so must these.
 */
export async function asRequestError<T>(prepare: () => Promise<T>): Promise<T> {
  try {
    return await prepare()
  } catch (err) {
    if (
      err instanceof InvalidRecordError ||
      err instanceof InvalidRecordKeyError
    ) {
      throw new InvalidRequestError(err.message)
    }
    throw err
  }
}

// Undefined when the repo has never been written to.
export async function buildSignedCommit(opts: {
  spaceUri: SpaceRefString
  author: string
  state: SpaceRepo | null
  keypair: Keypair
}): Promise<SignedCommit | undefined> {
  const { spaceUri, author, state, keypair } = opts
  if (!state?.setHash || !state.rev) return undefined

  const ctx: CommitCtx = {
    space: toSpaceRef(spaceUri).toString(),
    author,
    rev: state.rev,
  }
  return RepoCommit.fromState(state.setHash).sign(ctx, keypair)
}
