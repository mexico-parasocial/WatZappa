import { describe, expect, it } from 'vitest'
import { decideCommunity, decideRoom } from '../authz.js'

const member = { state: 'active', roles: [] }
const moderator = { state: 'active', roles: ['moderator'] }
const owner = { state: 'active', roles: ['owner'] }
const delegate = { state: 'active', roles: ['delegate'] }
const observer = { state: 'active', roles: ['observer'] }
const pending = { state: 'pending', roles: [] }

describe('decideCommunity (F9 policy)', () => {
  it('any active member may read and contribute', () => {
    expect(decideCommunity(member, 'community.read').allowed).toBe(true)
    expect(decideCommunity(member, 'community.contribute').allowed).toBe(true)
    expect(decideCommunity(member, 'sortition.run').allowed).toBe(true)
  })

  it('membership alone does not grant moderation', () => {
    const verdict = decideCommunity(member, 'community.moderate')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('moderator or owner')
    expect(decideCommunity(moderator, 'community.moderate').allowed).toBe(true)
    expect(decideCommunity(owner, 'community.moderate').allowed).toBe(true)
  })

  it('processing sortitions requires a governance role', () => {
    expect(decideCommunity(member, 'sortition.process').allowed).toBe(false)
    expect(decideCommunity(observer, 'sortition.process').allowed).toBe(false)
    expect(decideCommunity(moderator, 'sortition.process').allowed).toBe(true)
    expect(decideCommunity(owner, 'sortition.process').allowed).toBe(true)
    expect(decideCommunity(delegate, 'sortition.process').allowed).toBe(true)
  })

  it('non-active membership grants nothing', () => {
    expect(decideCommunity(pending, 'community.read').allowed).toBe(false)
    expect(decideCommunity(undefined, 'community.moderate').allowed).toBe(false)
  })
})

describe('decideRoom (chamber scoping)', () => {
  it('chamber rooms only admit their assigned members', () => {
    const inA = { state: 'active', roles: [] }
    expect(decideRoom(inA, 'chamber-a', 'A').allowed).toBe(true)
    const verdict = decideRoom(inA, 'chamber-b', 'A')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('chamber B')
  })

  it('main and observers rooms are open to all active members', () => {
    expect(decideRoom(member, 'main', undefined).allowed).toBe(true)
    expect(decideRoom(member, 'observers', undefined).allowed).toBe(true)
  })

  it('observers cannot access chamber rooms', () => {
    expect(decideRoom(observer, 'observers', 'B').allowed).toBe(true)
    expect(decideRoom(observer, 'main', undefined).allowed).toBe(true)
    expect(decideRoom(observer, 'chamber-a', 'A').allowed).toBe(false)
    expect(decideRoom(observer, 'chamber-b', 'B').allowed).toBe(false)
  })

  it('members without a chamber assignment cannot read chambers', () => {
    expect(decideRoom(member, 'chamber-a', undefined).allowed).toBe(false)
  })

  it('inactive members are rejected before chamber logic', () => {
    expect(decideRoom(pending, 'main', 'A').allowed).toBe(false)
  })
})
