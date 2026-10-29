import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Cid } from '@atproto/lex-data'
import type { SpacePermissionMatchOperation } from '@atproto/oauth-scopes'
import {
  COMMIT_MAC_TYPE,
  type Commit,
  MAC_HEADER,
  type MacType,
  RECORD_MAC_TYPE,
  RepoCommit,
  SpaceMacError,
  WANT_MAC_HEADER,
  computeCommitMac,
  computeRecordMac,
  decapsulate,
  formatMacHeader,
  parseWantMacHeader,
} from '@atproto/space'
import {
  type DidString,
  InvalidRecordKeyError,
  SpaceRef,
  type SpaceRefString,
} from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { SpaceRepo } from '../../../../actor-store/db/index.js'
import type { OAuthOutput } from '../../../../auth-output.js'
import type { AppContext } from '../../../../context.js'
import { InvalidRecordError } from '../../../../repo/index.js'
import { appendVary } from '../../../../util/http.js'

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
export function buildCommit(opts: {
  spaceUri: SpaceRefString
  repo: DidString
  state: SpaceRepo | null
}): Commit | undefined {
  const { spaceUri, repo, state } = opts
  if (!state?.setHash || !state.rev) return undefined
  return RepoCommit.fromState(state.setHash).toCommit({
    space: spaceUri,
    repo,
    rev: state.rev,
  })
}

/** Owner OAuth reads can request a per-request MAC without publishing a signature. */
export async function getSpaceMacSecret(
  ctx: AppContext,
  opts: {
    req: IncomingMessage
    res: ServerResponse
    repo: DidString
    type: MacType
  },
): Promise<Uint8Array | undefined> {
  const { req, res, repo, type } = opts
  appendVary(res, WANT_MAC_HEADER)
  const header = req.headers[WANT_MAC_HEADER]
  if (header === undefined) return undefined
  res.appendHeader('Access-Control-Expose-Headers', MAC_HEADER)
  try {
    if (req.headersDistinct[WANT_MAC_HEADER]?.length !== 1) {
      throw new SpaceMacError('request requires exactly one MAC header')
    }
    const keyShare = parseWantMacHeader(header, type)
    const key = await ctx.actorStore.kemKeypair(repo)
    if (!key)
      throw new InvalidRequestError(
        'Account KEM key is not provisioned',
        'KemKeyUnavailable',
      )
    return decapsulate(key, keyShare)
  } catch (err) {
    if (err instanceof SpaceMacError)
      throw new InvalidRequestError(err.message, 'BadSpaceMac')
    throw err
  }
}

export function commitMacHeaders(
  secret: Uint8Array | undefined,
  commit: Commit,
): Record<string, string> | undefined {
  return secret
    ? {
        [MAC_HEADER]: formatMacHeader(
          COMMIT_MAC_TYPE,
          computeCommitMac(secret, commit),
        ),
      }
    : undefined
}

export function recordMacHeaders(
  secret: Uint8Array | undefined,
  uri: string,
  cid: Cid,
): Record<string, string> | undefined {
  return secret
    ? {
        [MAC_HEADER]: formatMacHeader(
          RECORD_MAC_TYPE,
          computeRecordMac(secret, uri, cid),
        ),
      }
    : undefined
}
