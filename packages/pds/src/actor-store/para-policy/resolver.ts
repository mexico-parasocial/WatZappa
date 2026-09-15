import { SpaceRef } from '@atproto/syntax'
import type { ParaPolicyInput } from './reader.js'
import { getEffectiveParaPolicyRoles } from './types.js'

export type ParaPolicyAction = 'credential' | 'create' | 'update' | 'delete'

/** Explicit rules configured by PARA; no wildcard or default role grants. */
export type ParaPolicyRule = {
  space: string
  collection: string
  action: ParaPolicyAction
  clientIds: readonly string[]
  /** Empty means any active member; nonempty requires at least one effective role. */
  roles: readonly string[]
}

export type ParaPolicyRequest = {
  space: string
  principalDid: string
  clientId: string
  collection: string
  action: ParaPolicyAction
  now: number
  /** Mandatory on writes; omitted only during initial credential issuance. */
  policyEpoch?: number
}

export type ParaPolicyDenial =
  | 'space-unavailable'
  | 'projection-unavailable'
  | 'projection-stale'
  | 'epoch-mismatch'
  | 'not-active-member'
  | 'rule-denied'
  | 'role-denied'

export type ParaPolicyDecision =
  | { allowed: true; policyEpoch: number; roles: string[] }
  | { allowed: false; policyEpoch: number | null; denial: ParaPolicyDenial }

/** Pure authorization boundary. Invoke in the same authority-store transaction as a write. */
export class ParaPolicyResolver {
  private readonly rules: ParaPolicyRule[]

  constructor(
    rules: readonly ParaPolicyRule[],
    private readonly maxProjectionAgeMs: number,
  ) {
    if (!Number.isSafeInteger(maxProjectionAgeMs) || maxProjectionAgeMs <= 0) {
      throw new Error('A positive projection freshness bound is required')
    }
    this.rules = rules.map((rule) => ({
      ...rule,
      clientIds: [...rule.clientIds],
      roles: [...rule.roles],
    }))
  }

  resolve(
    request: ParaPolicyRequest,
    input: ParaPolicyInput,
  ): ParaPolicyDecision {
    const { space, state, member } = input
    const deny = (denial: ParaPolicyDenial): ParaPolicyDecision => ({
      allowed: false,
      policyEpoch: state?.policyEpoch ?? null,
      denial,
    })
    let authority: string
    try {
      authority = SpaceRef.parse(request.space).spaceDid
    } catch {
      return deny('space-unavailable')
    }
    if (
      !space ||
      space.uri !== request.space ||
      space.authority !== authority ||
      space.deletedAt !== null
    ) {
      return deny('space-unavailable')
    }
    if (
      !state ||
      state.space !== request.space ||
      state.projectionStatus !== 'ready' ||
      !Number.isSafeInteger(state.policyEpoch) ||
      state.policyEpoch < 1
    ) {
      return deny('projection-unavailable')
    }
    const issuedAt = Date.parse(state.issuedAt)
    const receivedAt = Date.parse(state.receivedAt)
    if (
      ![request.now, issuedAt, receivedAt].every(Number.isFinite) ||
      issuedAt > request.now ||
      receivedAt > request.now ||
      request.now - issuedAt >= this.maxProjectionAgeMs ||
      request.now - receivedAt >= this.maxProjectionAgeMs
    ) {
      return deny('projection-stale')
    }
    if (
      (request.action !== 'credential' || request.policyEpoch !== undefined) &&
      request.policyEpoch !== state.policyEpoch
    ) {
      return deny('epoch-mismatch')
    }
    if (
      !member ||
      member.space !== request.space ||
      member.did !== request.principalDid ||
      member.membershipState !== 'active'
    ) {
      return deny('not-active-member')
    }
    const rules = this.rules.filter(
      (rule) =>
        rule.space === request.space &&
        rule.collection === request.collection &&
        rule.action === request.action &&
        rule.clientIds.includes(request.clientId),
    )
    if (rules.length === 0) return deny('rule-denied')
    const roles = getEffectiveParaPolicyRoles(member, request.now)
    if (
      !rules.some(
        (rule) =>
          rule.roles.length === 0 ||
          rule.roles.some((role) => roles.includes(role)),
      )
    ) {
      return deny('role-denied')
    }
    return { allowed: true, policyEpoch: state.policyEpoch, roles: [...roles] }
  }
}
