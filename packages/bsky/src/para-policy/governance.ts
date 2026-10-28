import type { Kysely, Selectable } from 'kysely'
import { AtUri, isAtUriString, isValidDid } from '@atproto/syntax'
import type { ParaCommunityBoard } from '../data-plane/server/db/tables/para-community-board.js'
import type { ParaCommunityAdmission } from '../data-plane/server/db/tables/para-community-admission.js'
import type { ParaCommunityMembership } from '../data-plane/server/db/tables/para-community-membership.js'
import type { ParaPolicyChange } from './outbox.js'

/**
 * Narrow typed view of the AppView governance tables. Callers pass the same
 * open governance transaction they will hand to enqueue/prepareCheckpoint.
 */
export type ParaGovernanceDB = {
  para_community_board: ParaCommunityBoard
  para_community_admission: ParaCommunityAdmission
  para_community_membership: ParaCommunityMembership
}

export type ParaGovernanceMembers = ParaPolicyChange['members']

/** Modes the AppView board lexicon defines; anything else fails closed. */
export const KNOWN_GOVERNANCE_MODES = ['hierarchical', 'horizontal'] as const

export class ParaGovernanceError extends Error {
  name = 'ParaGovernanceError'
}

/**
 * Materialize the member list of a governance-authorized policy snapshot from
 * the AppView community tables, inside the caller's governance transaction.
 *
 * Contract (frozen; change only with a review of PERMISSIONED_DATA_PORT.md):
 *
 * 1. The board record must exist at `boardUri` — the exact URI the publisher
 *    is configured to sign for (`sourceUri`). Unknown or missing boards fail
 *    closed.
 * 2. The board's governanceMode must be a known lexicon value. Unknown or
 *    unset modes fail closed: the projection must not guess how a community
 *    governs itself.
 * 3. Members come from the community's membership rows, deduplicated per
 *    member DID (latest indexedAt wins, ties broken by record URI) and
 *    ordered by DID so the same governance state always materializes to the
 *    same bytes — retries keep their event identity.
 * 4. States map as PARA's projection expects, preserving PARA's distinction
 *    between voluntary and involuntary departure: active -> active,
 *    left -> left, removed -> removed, blocked -> blocked (tombstones),
 *    pending -> omitted (never a member). An unknown state fails closed
 *    rather than being dropped silently.
 * 5. No roles are materialized. Membership records are member-self-authored:
 *    their flat roles and roleAssignments (including `ratifiedBy` claims)
 *    carry no verifiable authority, and the governance record's authority
 *    lists are not persisted by the indexer. The snapshot therefore grants
 *    admission only; PARA role rules stay in the PDS resolver until a
 *    persisted, board-issued authority trace exists.
 */
export async function materializeGovernanceMembers(
  db: Kysely<ParaGovernanceDB>,
  boardUri: string,
): Promise<ParaGovernanceMembers> {
  if (!db.isTransaction) {
    throw new ParaGovernanceError(
      'Governance materialization requires the governance transaction',
    )
  }
  const uri = parseBoardUri(boardUri)
  const board = await db
    .selectFrom('para_community_board')
    .selectAll()
    .where('uri', '=', uri)
    .executeTakeFirst()
  if (!board) {
    throw new ParaGovernanceError(`No governance board at ${uri}`)
  }
  if (
    !board.governanceMode ||
    !(KNOWN_GOVERNANCE_MODES as readonly string[]).includes(
      board.governanceMode,
    )
  ) {
    throw new ParaGovernanceError(
      `Unknown governance mode for ${uri}: ${board.governanceMode ?? 'unset'}`,
    )
  }

  const rows = await db
    .selectFrom('para_community_membership')
    .selectAll()
    .where('communityUri', '=', uri)
    .orderBy('indexedAt', 'asc')
    .orderBy('uri', 'asc')
    .execute()
  const approvals = await db
    .selectFrom('para_community_admission')
    .selectAll()
    .where('communityUri', '=', uri)
    .execute()
  const byApproval = new Map(
    approvals
      .filter(
        (approval) =>
          approval.creator === board.creator &&
          isAtUriString(approval.uri) &&
          new AtUri(approval.uri).host === board.creator,
      )
      .map((approval) => [approval.memberDid, approval]),
  )

  const byMember = new Map<string, Selectable<ParaCommunityMembership>>()
  for (const row of rows) {
    if (!isValidDid(row.creator)) {
      throw new ParaGovernanceError(
        `Membership row with invalid member DID: ${row.uri}`,
      )
    }
    // Rows arrive oldest-first; the last write per member wins.
    byMember.set(row.creator, row)
  }

  const members: ParaGovernanceMembers = []
  for (const did of [...byMember.keys()].sort()) {
    const { membershipState } = byMember.get(did)!
    if (membershipState === 'pending') continue
    const approval = byApproval.get(did)
    if (!approval) continue
    if (approval.state === 'blocked' || approval.state === 'removed') {
      members.push({
        did,
        membershipState: approval.state,
        roles: [],
        roleAssignments: [],
      })
      continue
    }
    if (approval.state !== 'active') {
      throw new ParaGovernanceError(`Unknown admission state for ${did}`)
    }
    if (
      membershipState === 'active' ||
      membershipState === 'left' ||
      membershipState === 'removed' ||
      membershipState === 'blocked'
    ) {
      members.push({ did, membershipState, roles: [], roleAssignments: [] })
    } else {
      throw new ParaGovernanceError(
        `Unknown membership state for ${did}: ${membershipState}`,
      )
    }
  }
  return members
}

function parseBoardUri(boardUri: string): string {
  if (typeof boardUri !== 'string' || !isAtUriString(boardUri)) {
    throw new ParaGovernanceError(`Invalid board URI: ${boardUri}`)
  }
  const uri = new AtUri(boardUri)
  if (uri.collection !== 'com.para.community.board' || !uri.rkey) {
    throw new ParaGovernanceError(`Not a governance board URI: ${boardUri}`)
  }
  return boardUri
}
