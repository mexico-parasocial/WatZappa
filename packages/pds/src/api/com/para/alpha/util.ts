// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AccountDb } from '../../../../account-manager/db/index.js'

const ALPHA_STATES = [
  'AGU',
  'BCN',
  'BCS',
  'CAM',
  'CHH',
  'CHP',
  'CDMX',
  'COA',
  'COL',
  'DUR',
  'GRO',
  'GTO',
  'HGO',
  'JAL',
  'MEX',
  'MIC',
  'MOR',
  'NAY',
  'NL',
  'OAX',
  'PUE',
  'QUE',
  'QRO',
  'SIN',
  'SLP',
  'SON',
  'TAB',
  'TAM',
  'TLA',
  'VER',
  'YUC',
  'ZAC',
]

export const normalizeState = (value: string): string => {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'FRIEND') return normalized
  if (!ALPHA_STATES.includes(normalized)) {
    throw new InvalidRequestError(
      `Invalid state: ${value}. Must be one of: ${ALPHA_STATES.join(', ')}`,
    )
  }
  return normalized
}

export const parseInviteCode = (
  code: string,
): { state: string; token: string } => {
  const parts = code.trim().toUpperCase().split('-')
  if (parts.length < 2) {
    throw new InvalidRequestError(
      'Invalid invite code format. Expected: STATE-XXXX-XXXX',
    )
  }
  const state = parts[0]
  const token = parts.slice(1).join('-')
  return { state: normalizeState(state), token }
}

export const buildInviteCode = (state: string): string => {
  const normalized = normalizeState(state)
  const token = Array.from({ length: 8 }, () =>
    Math.random().toString(36).charAt(2).toUpperCase(),
  ).join('')
  return `${normalized}-${token.slice(0, 4)}-${token.slice(4)}`
}

export const getAlphaAccess = async (
  db: AccountDb,
  did: string,
): Promise<
  | { hasAccess: true; state: string }
  | { hasAccess: false; state?: string; waitlistPosition?: number }
> => {
  const request = await db.db
    .selectFrom('alpha_access_request')
    .selectAll()
    .where('did', '=', did)
    .executeTakeFirst()

  if (request?.status === 'approved') {
    return { hasAccess: true, state: request.state }
  }

  const invite = await db.db
    .selectFrom('alpha_invite')
    .selectAll()
    .where('did', '=', did)
    .where('usedAt', 'is not', null)
    .executeTakeFirst()

  if (invite) {
    return { hasAccess: true, state: invite.state }
  }

  if (request?.status === 'pending') {
    const position = await db.db
      .selectFrom('alpha_access_request')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('state', '=', request.state)
      .where('status', '=', 'pending')
      .where('createdAt', '<=', request.createdAt)
      .executeTakeFirst()

    return {
      hasAccess: false,
      state: request.state,
      waitlistPosition: Number(position?.count ?? 0),
    }
  }

  return { hasAccess: false }
}

export const requestAlphaAccess = async (
  db: AccountDb,
  did: string,
  state: string,
  inviteCode?: string,
): Promise<{ status: string; position?: number; state: string }> => {
  const existing = await getAlphaAccess(db, did)
  if (existing.hasAccess) {
    return { status: 'already_has_access', state: existing.state }
  }

  const normalizedState = normalizeState(state)
  const now = new Date().toISOString()

  // If invite code provided, validate and auto-approve
  if (inviteCode) {
    const parsed = parseInviteCode(inviteCode)
    const isFriendInvite = parsed.state === 'FRIEND'

    if (!isFriendInvite && parsed.state !== normalizedState) {
      throw new InvalidRequestError(
        `Invite code is for state ${parsed.state}, not ${normalizedState}.`,
      )
    }

    const invite = await db.db
      .selectFrom('alpha_invite')
      .selectAll()
      .where('code', '=', inviteCode.trim().toUpperCase())
      .executeTakeFirst()

    if (!invite) {
      throw new InvalidRequestError('Invalid invite code.')
    }
    if (invite.usedAt) {
      throw new InvalidRequestError('Invite code has already been used.')
    }

    // Friend invites use the FRIEND state's quota
    // Regular invites use the state's quota
    const quotaState = isFriendInvite ? 'FRIEND' : normalizedState
    const requestState = isFriendInvite ? normalizedState : normalizedState

    // Mark invite as used
    await db.db
      .updateTable('alpha_invite')
      .set({ did, usedAt: now })
      .where('code', '=', invite.code)
      .execute()

    // Upsert access request as approved
    await db.db
      .insertInto('alpha_access_request')
      .values({
        did,
        state: requestState,
        inviteCode: invite.code,
        status: 'approved',
        createdAt: now,
        approvedAt: now,
      })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet({
          state: requestState,
          inviteCode: invite.code,
          status: 'approved',
          approvedAt: now,
        }),
      )
      .execute()

    // Increment used slots
    await db.db
      .updateTable('alpha_rollout')
      .set((eb) => ({ usedSlots: eb('usedSlots', '+', 1) }))
      .where('state', '=', quotaState)
      .execute()

    return { status: 'approved', state: requestState }
  }

  // No invite code — check if state has open slots
  const rollout = await db.db
    .selectFrom('alpha_rollout')
    .selectAll()
    .where('state', '=', normalizedState)
    .executeTakeFirst()

  if (!rollout) {
    throw new InvalidRequestError(
      `Alpha access is not configured for ${normalizedState}.`,
    )
  }

  if (!rollout.isOpen) {
    throw new InvalidRequestError(
      `Alpha access is not open for ${normalizedState}. Try again later or use an invite code.`,
    )
  }

  if (rollout.usedSlots >= rollout.totalSlots) {
    // Waitlist
    await db.db
      .insertInto('alpha_access_request')
      .values({
        did,
        state: normalizedState,
        status: 'pending',
        createdAt: now,
      })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet({
          state: normalizedState,
          status: 'pending',
        }),
      )
      .execute()

    const position = await db.db
      .selectFrom('alpha_access_request')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('state', '=', normalizedState)
      .where('status', '=', 'pending')
      .where('createdAt', '<=', now)
      .executeTakeFirst()

    return {
      status: 'waitlisted',
      position: Number(position?.count ?? 0),
      state: normalizedState,
    }
  }

  // Auto-approve — slot available
  await db.db
    .insertInto('alpha_access_request')
    .values({
      did,
      state: normalizedState,
      status: 'approved',
      createdAt: now,
      approvedAt: now,
    })
    .onConflict((oc) =>
      oc.column('did').doUpdateSet({
        state: normalizedState,
        status: 'approved',
        approvedAt: now,
      }),
    )
    .execute()

  await db.db
    .updateTable('alpha_rollout')
    .set((eb) => ({ usedSlots: eb('usedSlots', '+', 1) }))
    .where('state', '=', normalizedState)
    .execute()

  return { status: 'approved', state: normalizedState }
}
