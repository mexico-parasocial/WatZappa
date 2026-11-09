import * as plc from '@did-plc/lib'
import {
  type CommunityAction,
  type CommunitySettings,
  TID,
  applyCommunityEvent,
  communityRequestMismatch,
  prepareCommunityEvent,
} from '@atproto/common'
import { P256Keypair, Secp256k1Keypair } from '@atproto/crypto'
import type { AtUriString, DidString, HandleString } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import {
  commitWrites,
  stripUndefined,
  updateRepoRoot,
} from '../../api/com/para/util.js'
import type { AppContext } from '../../context.js'
import { com } from '../../lexicons/index.js'
import { dbLogger } from '../../logger.js'
import { type PreparedCreate, prepareCreate } from '../../repo/index.js'
import type { ProvenRequest } from './requests.js'

/** DID document service id that members' PDSes proxy `act` to. */
export const COMMUNITY_SERVICE_ID = 'para_community'

export interface AppendInput {
  action: CommunityAction
  actor: DidString
  subject: DidString
  request: ProvenRequest
  offer?: number
  suspensionDays?: number
  settings?: CommunitySettings
}

export interface AppendResult {
  uri: AtUriString
  cid: string
  seq: number
}

// One writer at a time per community within this process. SQLite would
// retry a conflicting transaction anyway; this keeps concurrent calls from
// spinning on it.
const locks = new Map<string, Promise<unknown>>()

function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve()
  const next = prior.then(fn, fn)
  const settled = next.then(
    () => undefined,
    () => undefined,
  )
  locks.set(key, settled)
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key)
  })
  return next
}

/**
 * Decides the action with the community policy and, if allowed, appends its
 * event, in one transaction on the community's store (OD-9 §3.3). Time comes
 * from this PDS's clock. A refusal throws with the policy's reason and
 * writes nothing.
 */
export function appendCommunityEvent(
  ctx: AppContext,
  community: DidString,
  input: AppendInput,
  extraWrites: (seq: number) => Promise<PreparedCreate[]> = async () => [],
): Promise<AppendResult> {
  return serialized(community, async () => {
    const { commit, result } = await ctx.actorStore.transact(
      community,
      async (txn) => {
        const head = await txn.community.head()
        if (!head && input.action !== 'community.found') {
          throw new InvalidRequestError(
            'This account is not a community.',
            'CommunityNotFound',
          )
        }
        if (await txn.community.isRequestUsed(input.request.ref.uri)) {
          throw new InvalidRequestError(
            'The request was already used.',
            'InvalidRequest',
          )
        }
        const seq = (head?.seq ?? 0) + 1
        const event = prepareCommunityEvent({
          seq,
          action: input.action,
          actor: input.actor,
          subject: input.subject,
          createdAt: new Date().toISOString(),
          offer: input.offer,
          suspensionDays: input.suspensionDays,
          settings: input.settings,
        })
        const mismatch = communityRequestMismatch(
          community,
          input.request.request,
          event,
        )
        if (mismatch) throw new InvalidRequestError(mismatch, 'InvalidRequest')
        const decision = applyCommunityEvent(
          await txn.community.view(head, event),
          event,
        )
        if (!decision.ok) {
          throw new InvalidRequestError(decision.message, decision.code)
        }
        const write = await prepareCreate({
          did: community,
          collection: com.para.community.event.$type,
          rkey: TID.nextStr(),
          record: stripUndefined({
            $type: com.para.community.event.$type,
            seq,
            prev: head?.cid,
            action: event.action,
            actor: event.actor,
            subject: event.subject,
            request: input.request.ref,
            requestProof: input.request.proof,
            offer: event.offer,
            expiresAt: event.expiresAt,
            governanceMode: event.settings?.governanceMode,
            admissionMode: event.settings?.admissionMode,
            createdAt: event.createdAt,
          }),
        })
        const commit = await commitWrites(ctx, txn, community, [
          write,
          ...(await extraWrites(seq)),
        ])
        await txn.community.apply(decision.patch, {
          seq,
          uri: write.uri.toString(),
          cid: write.cid.toString(),
          settings: head?.settings,
        })
        await txn.community.useRequest(input.request.ref.uri, seq)
        return {
          commit,
          result: {
            uri: write.uri.toString() as AtUriString,
            cid: write.cid.toString(),
            seq,
          },
        }
      },
    )
    await updateRepoRoot(ctx, community, commit, `community.${input.action}`)
    return result
  })
}

/**
 * Creates the community's DID and an empty repo. It is an actor with no
 * account row, so nobody can sign in as it; its DID document names this PDS
 * both as its PDS and as its `#para_community` host.
 */
export async function createCommunityAccount(
  ctx: AppContext,
  handle: HandleString,
): Promise<DidString> {
  const signingKey = await Secp256k1Keypair.create({ exportable: true })
  const kemKey = await P256Keypair.create({ exportable: true })
  const endpoint = ctx.cfg.service.publicUrl
  const unsigned = plc.formatAtprotoOp({
    signingKey: signingKey.did(),
    handle,
    pds: endpoint,
    rotationKeys: [ctx.plcRotationKey.did()],
    prev: null,
  })
  unsigned.verificationMethods.atproto_kem = kemKey.did()
  unsigned.services[COMMUNITY_SERVICE_ID] = {
    type: 'ParaCommunityHost',
    endpoint,
  }
  const op = await plc.signOperation(unsigned, ctx.plcRotationKey)
  const did = (await plc.didForCreateOp(op)) as DidString

  await ctx.actorStore.create(did, signingKey, kemKey)
  try {
    const commit = await ctx.actorStore.transact(did, (txn) =>
      txn.repo.createRepo([]),
    )
    await ctx.plcClient.sendOperation(did, op)
    await ctx.accountManager.createAccount({
      did,
      handle,
      repoCid: commit.cid,
      repoRev: commit.rev,
    })
    await ctx.sequencer.sequenceAccountCreation(did, handle, commit)
  } catch (err) {
    dbLogger.error({ err, did, handle }, 'community.createAccountFailed')
    await ctx.actorStore.destroy(did)
    throw err
  }
  return did
}
