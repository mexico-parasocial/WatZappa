const UNIT = 1_000_000

export interface EffectiveBallot {
  actorDid: string
  nullifier: string
  selectedOption: number
  indexedAt: string
  uri: string
}

export interface EffectiveDelegation {
  actorDid: string
  nullifier: string
  delegateTo: string
  mode: 'active' | 'passive'
  indexedAt: string
  uri: string
}

export interface EffectiveTally {
  direct: number
  delegated: number
  totalParticipants: number
  effectivePowerMicros: number[]
  optionPersonCounts: number[]
  effectiveTotalPowerMicros: number
  winningOption: number | null
  isTie: boolean
}

function integerSqrt(value: bigint): bigint {
  if (value < 2n) return value
  let x = value
  let y = (x + 1n) >> 1n
  while (y < x) {
    x = y
    y = (x + value / x) >> 1n
  }
  return x
}

function newer(
  a: { indexedAt: string; uri: string },
  b: { indexedAt: string; uri: string },
) {
  return (
    a.indexedAt > b.indexedAt || (a.indexedAt === b.indexedAt && a.uri > b.uri)
  )
}

/** Resolve one person once, through any number of grants, to a direct ballot. */
export function resolveCabildeoDelegations(
  optionCount: number,
  ballots: EffectiveBallot[],
  delegations: EffectiveDelegation[],
): EffectiveTally {
  const directByPerson = new Map<string, EffectiveBallot>()
  const personByDid = new Map<string, string>()
  for (const ballot of ballots) {
    if (ballot.selectedOption < 0 || ballot.selectedOption >= optionCount)
      continue
    personByDid.set(ballot.actorDid, ballot.nullifier)
    const old = directByPerson.get(ballot.nullifier)
    if (!old || newer(ballot, old)) directByPerson.set(ballot.nullifier, ballot)
  }

  const grantsByPerson = new Map<string, EffectiveDelegation>()
  for (const grant of delegations) {
    personByDid.set(grant.actorDid, grant.nullifier)
    if (directByPerson.has(grant.nullifier)) continue
    const old = grantsByPerson.get(grant.nullifier)
    if (
      !old ||
      (grant.mode === 'active' && old.mode !== 'active') ||
      (grant.mode === old.mode && newer(grant, old))
    ) {
      grantsByPerson.set(grant.nullifier, grant)
    }
  }

  const delegatedByTerminal = new Map<string, number>()
  for (const grant of grantsByPerson.values()) {
    let target = grant.delegateTo
    const seen = new Set<string>([grant.nullifier])
    while (true) {
      const person = personByDid.get(target)
      if (!person || seen.has(person)) break
      const terminal = directByPerson.get(person)
      if (terminal) {
        delegatedByTerminal.set(
          terminal.nullifier,
          (delegatedByTerminal.get(terminal.nullifier) ?? 0) + 1,
        )
        break
      }
      seen.add(person)
      const next = grantsByPerson.get(person)
      if (!next) break
      target = next.delegateTo
    }
  }

  const effectivePowerMicros = Array.from({ length: optionCount }, () => 0)
  const optionPersonCounts = Array.from({ length: optionCount }, () => 0)
  for (const ballot of directByPerson.values()) {
    const delegated = delegatedByTerminal.get(ballot.nullifier) ?? 0
    optionPersonCounts[ballot.selectedOption] += 1 + delegated
    const delegatedPower = Number(
      integerSqrt(BigInt(delegated) * BigInt(UNIT) * BigInt(UNIT)),
    )
    effectivePowerMicros[ballot.selectedOption] += UNIT + delegatedPower
  }
  const delegated = [...delegatedByTerminal.values()].reduce(
    (sum, n) => sum + n,
    0,
  )
  const effectiveTotalPowerMicros = effectivePowerMicros.reduce(
    (sum, n) => sum + n,
    0,
  )
  const max = Math.max(0, ...effectivePowerMicros)
  const winners = effectivePowerMicros
    .map((value, index) => (value === max && max > 0 ? index : -1))
    .filter((i) => i >= 0)
  return {
    direct: directByPerson.size,
    delegated,
    totalParticipants: directByPerson.size + delegated,
    effectivePowerMicros,
    optionPersonCounts,
    effectiveTotalPowerMicros,
    winningOption: winners.length === 1 ? winners[0] : null,
    isTie: winners.length > 1,
  }
}
