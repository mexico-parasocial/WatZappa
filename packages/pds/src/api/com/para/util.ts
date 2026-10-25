import type { DidString } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { ActorStoreTransactor } from '../../../actor-store/actor-store-transactor.js'
import type { AppContext } from '../../../context.js'
import { dbLogger } from '../../../logger.js'
import {
  BadCommitSwapError,
  BadRecordSwapError,
  type CommitDataWithOps,
  InvalidRecordError,
  type PreparedWrite,
} from '../../../repo/index.js'

/**
 * Commits `writes` to the actor's repo and sequences the commit. Must run
 * inside `ctx.actorStore.transact()`; call {@link updateRepoRoot} once the
 * transaction has completed.
 */
export const commitWrites = async (
  ctx: AppContext,
  actorTxn: ActorStoreTransactor,
  did: DidString,
  writes: PreparedWrite[],
): Promise<CommitDataWithOps> => {
  const commit = await actorTxn.repo.processWrites(writes).catch((err) => {
    if (
      err instanceof BadCommitSwapError ||
      err instanceof BadRecordSwapError
    ) {
      throw new InvalidRequestError(err.message, 'InvalidSwap')
    }
    if (err instanceof InvalidRecordError) {
      throw new InvalidRequestError(err.message)
    }
    throw err
  })
  await ctx.sequencer.sequenceCommit(did, commit)
  return commit
}

export const updateRepoRoot = async (
  ctx: AppContext,
  did: DidString,
  commit: CommitDataWithOps,
  method: string,
) => {
  await ctx.accountManager
    .updateRepoRoot(did, commit.cid, commit.rev)
    .catch((err) => {
      dbLogger.error(
        { err, did, cid: commit.cid, rev: commit.rev },
        `failed to update account root after ${method}`,
      )
    })
}

/** Drops `undefined` fields, which a record's CBOR encoding cannot carry. */
export const stripUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T
