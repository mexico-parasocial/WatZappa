import {
  type CommunityAction,
  type CommunityRequest,
  TID,
  getPdsEndpoint,
} from '@atproto/common'
import { parseCid } from '@atproto/lex-data'
import * as repo from '@atproto/repo'
import { AtUri, type DidString } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { SqlRepoReader } from '../../actor-store/repo/sql-repo-reader.js'
import { commitWrites, updateRepoRoot } from '../../api/com/para/util.js'
import type { AppContext } from '../../context.js'
import { com } from '../../lexicons/index.js'
import { prepareCreate } from '../../repo/index.js'

/** How long a request the host writes for a local member stays valid. */
const LOCAL_REQUEST_TTL_MS = 60 * 60 * 1000

export interface RequestFields {
  community: DidString
  action: CommunityAction
  subject: DidString
  offer?: number
  suspensionDays?: number
}

// A type alias, not an interface, so it fits a record's `LexMap` fields.
export type RequestRef = {
  uri: string
  cid: string
}

/** A request with the proof that its actor's repo holds it (OD-9 §6). */
export interface ProvenRequest {
  ref: RequestRef
  proof: Uint8Array
  request: CommunityRequest
}

/**
 * Writes the member's request into their own repo, for a member hosted
 * here, and proves it. They authenticated to this PDS for the call, so this
 * is their own write, not the host acting for them.
 */
export async function writeLocalRequest(
  ctx: AppContext,
  actor: DidString,
  fields: RequestFields,
): Promise<ProvenRequest> {
  const now = Date.now()
  const record = {
    $type: com.para.community.request.$type,
    ...fields,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LOCAL_REQUEST_TTL_MS).toISOString(),
  }
  for (const key of ['offer', 'suspensionDays'] as const) {
    if (record[key] === undefined) delete record[key]
  }
  const { commit, write } = await ctx.actorStore.transact(
    actor,
    async (actorTxn) => {
      const write = await prepareCreate({
        did: actor,
        collection: com.para.community.request.$type,
        rkey: TID.nextStr(),
        record,
      })
      const commit = await commitWrites(ctx, actorTxn, actor, [write])
      return { commit, write }
    },
  )
  await updateRepoRoot(ctx, actor, commit, 'community.request')
  return proveRequest(ctx, actor, {
    uri: write.uri.toString(),
    cid: write.cid.toString(),
  })
}

/**
 * Proves a request that `actor` already wrote: from this PDS's own store
 * when the actor is hosted here, otherwise from their PDS's
 * `com.atproto.sync.getRecord`. The proof is checked against the actor's
 * signing key either way, so a PDS that answers falsely gains nothing.
 */
export async function proveRequest(
  ctx: AppContext,
  actor: DidString,
  ref: RequestRef,
): Promise<ProvenRequest> {
  const uri = new AtUri(ref.uri)
  if (
    uri.host !== actor ||
    uri.collection !== com.para.community.request.$type
  ) {
    throw invalid('The request must be the caller’s own community request.')
  }
  const local = await ctx.accountManager.getAccount(actor)
  const proof = local
    ? await localProof(ctx, actor, uri.rkey)
    : await remoteProof(ctx, actor, uri.rkey)
  const signingKey = local
    ? (await ctx.actorStore.keypair(actor)).did()
    : await remoteSigningKey(ctx, actor)
  const request = await verifyRequestProof(proof, actor, signingKey, ref)
  return { ref, proof, request }
}

/**
 * The request record that `proof` shows in `actor`'s repo under `ref`, or a
 * refusal. The AppView runs the same check on every event it folds.
 */
export async function verifyRequestProof(
  proof: Uint8Array,
  actor: DidString,
  signingKey: string,
  ref: RequestRef,
): Promise<CommunityRequest> {
  const uri = new AtUri(ref.uri)
  const claim = {
    collection: uri.collection,
    rkey: uri.rkey,
    cid: parseCid(ref.cid),
  }
  try {
    const { verified } = await repo.verifyProofs(
      proof,
      [claim],
      actor,
      signingKey,
    )
    if (verified.length !== 1) throw invalid('The request proof is invalid.')
    const records = await repo.verifyRecords(proof, actor, signingKey)
    const found = records.find(
      (record) =>
        record.collection === claim.collection && record.rkey === claim.rkey,
    )
    if (!found) throw invalid('The request proof is invalid.')
    return found.record as unknown as CommunityRequest
  } catch (err) {
    if (err instanceof InvalidRequestError) throw err
    throw invalid('The request proof is invalid.')
  }
}

async function localProof(ctx: AppContext, actor: DidString, rkey: string) {
  await using db = await ctx.actorStore.openDb(actor)
  const storage = new SqlRepoReader(db)
  const commit = await storage.getRoot()
  if (!commit) throw invalid('The caller has no repo.')
  // Awaited here: the iterator reads from `db`, which closes on return.
  return await collect(
    repo.getRecords(storage, commit, [
      { collection: com.para.community.request.$type, rkey },
    ]),
  )
}

async function remoteProof(ctx: AppContext, actor: DidString, rkey: string) {
  const doc = await ctx.idResolver.did.resolve(actor)
  const endpoint = doc ? getPdsEndpoint(doc) : undefined
  if (!endpoint) throw invalid('The caller’s PDS could not be resolved.')
  try {
    const body = await ctx
      .safeClient(endpoint)
      .call(com.atproto.sync.getRecord, {
        did: actor,
        collection: com.para.community.request.$type,
        rkey,
      })
    return body instanceof Uint8Array ? body : new Uint8Array(body as never)
  } catch {
    throw invalid('The request could not be fetched from the caller’s PDS.')
  }
}

async function remoteSigningKey(ctx: AppContext, actor: DidString) {
  const data = await ctx.idResolver.did.resolveAtprotoData(actor)
  return data.signingKey
}

async function collect(iter: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = []
  for await (const chunk of iter) chunks.push(chunk)
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const invalid = (message: string) =>
  new InvalidRequestError(message, 'InvalidRequest')
