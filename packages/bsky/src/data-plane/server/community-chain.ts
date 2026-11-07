import { type Selectable, sql } from 'kysely'
import {
  type CommunityEvent,
  type CommunityMember,
  type CommunityOffice,
  type CommunityPatch,
  type CommunityRequest,
  type CommunitySettings,
  type CommunityStateView,
  applyCommunityEvent,
  communityRequestMismatch,
  getServiceEndpoint,
  isCommunityAction,
} from '@atproto/common'
import type { IdResolver } from '@atproto/identity'
import { parseCid } from '@atproto/lex-data'
import { verifyProofs, verifyRecords } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import type { DatabaseSchemaType } from './db/database-schema.js'
import type { Database } from './db/index.js'

type ParaCommunityChainEvent = Selectable<
  DatabaseSchemaType['para_community_chain_event']
>

const REQUEST_COLLECTION = 'com.para.community.request'
const COMMUNITY_SERVICE_ID = '#para_community'

/** Resolves a DID's current `#atproto` signing key, or `null`. */
export type SigningKeyResolver = (did: string) => Promise<string | null>

export function signingKeyResolver(idResolver: IdResolver): SigningKeyResolver {
  return async (did) => {
    try {
      return (await idResolver.did.resolveAtprotoData(did)).signingKey
    } catch {
      return null
    }
  }
}

/** Whether `did`'s document names a `#para_community` host (OD-9 §3.1). */
export type CommunityHostCheck = (did: string) => Promise<boolean>

export function communityHostCheck(idResolver: IdResolver): CommunityHostCheck {
  return async (did) => {
    try {
      const doc = await idResolver.did.resolve(did)
      return Boolean(
        doc && getServiceEndpoint(doc, { id: COMMUNITY_SERVICE_ID }),
      )
    } catch {
      return false
    }
  }
}

export interface ChainDeps {
  signingKey: SigningKeyResolver
  isCommunityHost: CommunityHostCheck
}

/**
 * Applies every event of `community` that can follow its current state, in
 * `seq` order, with the shared policy (OD-9 §3.5). Run inside a transaction:
 * the community's row is locked, so concurrent indexing of its events
 * serializes here. An event whose predecessor has not arrived waits. One
 * that fails verification is recorded `invalid` and changes nothing. Two
 * events with one `seq`, or a `prev` that does not match, freeze the
 * community. Each outcome depends only on the community's repo and on each
 * actor's signing key, never on arrival order.
 */
export async function advanceCommunityChain(
  db: Database,
  deps: ChainDeps,
  community: string,
  timestamp: string,
): Promise<void> {
  await db.db
    .insertInto('para_community_account')
    .values({ did: community, indexedAt: timestamp })
    .onConflict((oc) => oc.column('did').doNothing())
    .execute()
  let account = await db.db
    .selectFrom('para_community_account')
    .selectAll()
    .where('did', '=', community)
    .forUpdate()
    .executeTakeFirstOrThrow()

  while (!account.broken) {
    const seq = account.lastSeq + 1
    const candidates = await db.db
      .selectFrom('para_community_chain_event')
      .selectAll()
      .where('community', '=', community)
      .where('seq', '=', seq)
      .execute()
    if (candidates.length === 0) return
    if (candidates.length > 1) {
      await breakChain(db, community, `Two events claim seq ${seq}.`)
      return
    }
    const [event] = candidates
    if (event.tampered) {
      await breakChain(db, community, `Event ${seq} was ${event.tampered}.`)
      return
    }
    if ((event.prev ?? null) !== (seq === 1 ? null : account.lastCid)) {
      await breakChain(
        db,
        community,
        `Event ${seq} does not follow ${seq - 1}.`,
      )
      return
    }

    const outcome = await verifyChainEvent(db, deps, account, event)
    if (outcome.ok) {
      await applyPatch(db, community, outcome.patch, event)
    }
    await db.db
      .updateTable('para_community_chain_event')
      .set({
        status: outcome.ok ? 'applied' : 'invalid',
        reason: outcome.ok ? null : outcome.reason,
      })
      .where('uri', '=', event.uri)
      .execute()
    account = await db.db
      .updateTable('para_community_account')
      .set({
        lastSeq: seq,
        lastCid: event.cid,
        ...(outcome.ok && outcome.patch.settings
          ? {
              governanceMode: outcome.patch.settings.governanceMode,
              admissionMode: outcome.patch.settings.admissionMode,
            }
          : {}),
      })
      .where('did', '=', community)
      .returningAll()
      .executeTakeFirstOrThrow()
  }
}

/** Freezes the community: its chain was rewritten or deleted. Fail closed. */
export async function breakChain(
  db: Database,
  community: string,
  reason: string,
): Promise<void> {
  await db.db
    .updateTable('para_community_account')
    .set({ broken: reason })
    .where('did', '=', community)
    .where('broken', 'is', null)
    .execute()
}

type Outcome =
  { ok: true; patch: CommunityPatch } | { ok: false; reason: string }

async function verifyChainEvent(
  db: Database,
  deps: ChainDeps,
  account: {
    did: string
    governanceMode: string | null
    admissionMode: string | null
    lastSeq: number
  },
  row: ParaCommunityChainEvent,
): Promise<Outcome> {
  if (!isCommunityAction(row.action)) {
    return { ok: false, reason: `Unknown action ${row.action}.` }
  }
  const event: CommunityEvent = {
    seq: row.seq,
    action: row.action,
    actor: row.actor,
    subject: row.subject,
    createdAt: row.createdAt,
    ...(row.offer !== null ? { offer: row.offer } : {}),
    ...(row.expiresAt !== null ? { expiresAt: row.expiresAt } : {}),
    ...(row.governanceMode && row.admissionMode
      ? {
          settings: {
            governanceMode: row.governanceMode,
            admissionMode: row.admissionMode,
          } as CommunitySettings,
        }
      : {}),
  }

  if (
    event.action === 'community.found' &&
    !(await deps.isCommunityHost(account.did))
  ) {
    return { ok: false, reason: 'The DID document names no community host.' }
  }

  const request = await provenRequest(db, deps, row)
  if ('reason' in request) return { ok: false, reason: request.reason }
  const mismatch = communityRequestMismatch(account.did, request.request, event)
  if (mismatch) return { ok: false, reason: mismatch }

  const decision = applyCommunityEvent(
    await stateView(db, account, event),
    event,
  )
  return decision.ok
    ? { ok: true, patch: decision.patch }
    : { ok: false, reason: `${decision.code}: ${decision.message}` }
}

async function provenRequest(
  db: Database,
  deps: ChainDeps,
  row: ParaCommunityChainEvent,
): Promise<{ request: CommunityRequest } | { reason: string }> {
  let uri: AtUri
  try {
    uri = new AtUri(row.requestUri)
  } catch {
    return { reason: 'The request reference is invalid.' }
  }
  if (uri.host !== row.actor || uri.collection !== REQUEST_COLLECTION) {
    return { reason: 'The request is not the actor’s own.' }
  }
  const used = await db.db
    .selectFrom('para_community_used_request')
    .select('requestUri')
    .where('requestUri', '=', row.requestUri)
    .executeTakeFirst()
  if (used) return { reason: 'The request already backs another event.' }

  const key = await deps.signingKey(row.actor)
  if (!key) return { reason: 'The actor’s signing key could not be resolved.' }
  try {
    const proof = new Uint8Array(row.requestProof)
    const { verified } = await verifyProofs(
      proof,
      [
        {
          collection: uri.collection,
          rkey: uri.rkey,
          cid: parseCid(row.requestCid),
        },
      ],
      row.actor,
      key,
    )
    if (verified.length !== 1)
      return { reason: 'The request proof is invalid.' }
    const found = (await verifyRecords(proof, row.actor, key)).find(
      (record) =>
        record.collection === uri.collection && record.rkey === uri.rkey,
    )
    if (!found) return { reason: 'The request proof is invalid.' }
    return { request: found.record as unknown as CommunityRequest }
  } catch {
    return { reason: 'The request proof is invalid.' }
  }
}

async function stateView(
  db: Database,
  account: {
    did: string
    governanceMode: string | null
    admissionMode: string | null
    lastSeq: number
  },
  event: CommunityEvent,
): Promise<CommunityStateView> {
  const offer =
    event.offer === undefined
      ? undefined
      : await db.db
          .selectFrom('para_community_open_offer')
          .selectAll()
          .where('community', '=', account.did)
          .where('seq', '=', event.offer)
          .executeTakeFirst()
  const dids = [...new Set([event.actor, event.subject, offer?.issuer])].filter(
    (did): did is string => did !== undefined,
  )
  const members = new Map(
    (
      await db.db
        .selectFrom('para_community_member_state')
        .selectAll()
        .where('community', '=', account.did)
        .where('did', 'in', dids)
        .execute()
    ).map((row) => [row.did, toMember(row)]),
  )
  const owners = await db.db
    .selectFrom('para_community_member_state')
    .select(sql<number>`count(*)`.as('count'))
    .where('community', '=', account.did)
    .where('status', '=', 'active')
    .where(sql<boolean>`offices ? 'owner'`)
    .executeTakeFirstOrThrow()
  return {
    settings:
      account.governanceMode && account.admissionMode
        ? ({
            governanceMode: account.governanceMode,
            admissionMode: account.admissionMode,
          } as CommunitySettings)
        : null,
    lastSeq: account.lastSeq,
    member: (did) => members.get(did),
    openOffer: (seq) =>
      offer && offer.seq === seq
        ? { ...offer, office: offer.office as CommunityOffice }
        : undefined,
    ownerCount: () => Number(owners.count),
  }
}

async function applyPatch(
  db: Database,
  community: string,
  patch: CommunityPatch,
  event: ParaCommunityChainEvent,
): Promise<void> {
  for (const [did, member] of patch.members) {
    const row = {
      status: member.status,
      offices: JSON.stringify(member.offices),
      suspendedUntil: member.suspendedUntil ?? null,
      since: member.since,
    }
    await db.db
      .insertInto('para_community_member_state')
      .values({ community, did, ...row, joinedAt: event.createdAt })
      .onConflict((oc) =>
        oc.columns(['community', 'did']).doUpdateSet({
          ...row,
          // Rejoining after leaving restarts membership; other changes keep it.
          joinedAt: sql`case
            when para_community_member_state.status = 'left'
              and excluded.status <> 'left'
            then excluded."joinedAt"
            else para_community_member_state."joinedAt"
          end`,
        }),
      )
      .execute()
  }
  for (const offer of patch.openedOffers) {
    await db.db
      .insertInto('para_community_open_offer')
      .values({ community, ...offer })
      .execute()
  }
  if (patch.closedOffers.length > 0) {
    await db.db
      .deleteFrom('para_community_open_offer')
      .where('community', '=', community)
      .where('seq', 'in', patch.closedOffers)
      .execute()
  }
  await db.db
    .insertInto('para_community_used_request')
    .values({ requestUri: event.requestUri, community, seq: event.seq })
    .execute()
}

function toMember(row: {
  status: string
  offices: string[]
  suspendedUntil: string | null
  since: number
}): CommunityMember {
  return {
    status: row.status as CommunityMember['status'],
    offices: row.offices as CommunityOffice[],
    ...(row.suspendedUntil ? { suspendedUntil: row.suspendedUntil } : {}),
    since: row.since,
  }
}

/**
 * Clears the folded state of `community` and folds its stored events again.
 * The outcome must equal the incremental one: that is what makes a rebuild
 * safe (OD-9 §9, phase 2 exit).
 */
export async function refoldCommunityChain(
  db: Database,
  deps: ChainDeps,
  community: string,
  timestamp: string,
): Promise<void> {
  for (const table of [
    'para_community_member_state',
    'para_community_open_offer',
    'para_community_used_request',
  ] as const) {
    await db.db.deleteFrom(table).where('community', '=', community).execute()
  }
  await db.db
    .updateTable('para_community_chain_event')
    .set({ status: 'pending', reason: null })
    .where('community', '=', community)
    .execute()
  await db.db
    .updateTable('para_community_account')
    .set({
      lastSeq: 0,
      lastCid: null,
      governanceMode: null,
      admissionMode: null,
      broken: null,
    })
    .where('did', '=', community)
    .execute()
  await advanceCommunityChain(db, deps, community, timestamp)
}
