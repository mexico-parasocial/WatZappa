import { GovernanceLabError } from './engine.js'
import type { DelegationEvent, EventEnvelope, Scope } from './types.js'

type QvlRecord = {
  delegate: string
  delegator: string
  scope: { mode: string; community?: string; topic?: string; proposal?: string }
  expiresAt?: string
}
type CivicRecord = {
  mode?: string
  delegateTo?: string
  cabildeo?: string
  community?: string
  scopeFlairs?: string[]
}

/** Explicit trusted receipt metadata; adapters do not infer it from createdAt. */
export interface AdapterContext extends EventEnvelope {
  community: string
  expiresAt: number
}

function unsupported(message: string): never {
  throw new GovernanceLabError('UnsupportedLegacyDelegation', message)
}

/** Normalizes a synthetic QVL fixture. Unknown/ambiguous scope is never widened. */
export function adaptQvlDelegation(
  record: QvlRecord,
  context: AdapterContext,
): DelegationEvent {
  if (record.delegator !== context.actor)
    unsupported('Delegator does not own the record')
  let scope: Scope
  switch (record.scope.mode) {
    case 'proposal':
      if (
        !record.scope.proposal ||
        record.scope.topic ||
        record.scope.community
      )
        unsupported('Ambiguous proposal scope')
      scope = { mode: 'proposal', proposal: record.scope.proposal }
      break
    case 'community':
      if (
        record.scope.community !== context.community ||
        record.scope.topic ||
        record.scope.proposal
      )
        unsupported('Community must match the election')
      scope = { mode: 'community' }
      break
    case 'topic':
    case 'topicCommunity':
      if (
        !record.scope.topic ||
        record.scope.proposal ||
        (record.scope.mode === 'topicCommunity'
          ? record.scope.community !== context.community
          : record.scope.community !== undefined)
      )
        unsupported('Ambiguous topic scope')
      scope = { mode: 'topic', topic: record.scope.topic }
      break
    default:
      unsupported('Unknown scope mode')
  }
  const expiresAt =
    record.expiresAt === undefined
      ? context.expiresAt
      : Date.parse(record.expiresAt)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= context.acceptedAt)
    unsupported('Invalid expiry')
  return {
    id: context.id,
    election: context.election,
    actor: context.actor,
    sequence: context.sequence,
    acceptedAt: context.acceptedAt,
    kind: 'delegate',
    delegate: record.delegate,
    scope,
    expiresAt,
  }
}

/** Passive party rules require a resolver; they cannot silently become a grant. */
export function adaptCivicDelegation(
  record: CivicRecord,
  context: AdapterContext,
): DelegationEvent {
  if (
    (record.mode !== undefined && record.mode !== 'active') ||
    !record.delegateTo
  )
    unsupported('Only an explicit active delegate can be normalized')
  if (record.community !== undefined && record.community !== context.community)
    unsupported('Community must match the election')
  let scope: Scope
  if (record.cabildeo) {
    if (record.scopeFlairs?.length)
      unsupported('Resolve proposal/topic ambiguity before import')
    scope = { mode: 'proposal', proposal: record.cabildeo }
  } else {
    if (record.scopeFlairs?.length !== 1)
      unsupported('Exactly one explicit topic is required')
    scope = { mode: 'topic', topic: record.scopeFlairs[0] }
  }
  return {
    id: context.id,
    election: context.election,
    actor: context.actor,
    sequence: context.sequence,
    acceptedAt: context.acceptedAt,
    kind: 'delegate',
    delegate: record.delegateTo,
    scope,
    expiresAt: context.expiresAt,
  }
}
