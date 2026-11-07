import {
  ASSEMBLY_DECISIONS,
  assemblyQuorumTarget,
  evaluateAssemblyVote,
} from './community-assembly.js'
import { resolveAvailableAction } from './community-authority.js'

describe('assembly decisions', () => {
  describe(assemblyQuorumTarget, () => {
    it.each([
      [0, 0],
      [1, 1],
      [3, 3],
      [10, 10],
      [11, 10],
      [50, 10],
      [100, 20],
      [1001, 201],
    ])('asks %i members for %i ballots', (electorate, target) => {
      expect(assemblyQuorumTarget(electorate)).toBe(target)
    })
  })

  describe(evaluateAssemblyVote, () => {
    const vote = (
      policy: 'assembly_majority' | 'assembly_supermajority',
      electorate: number,
      approvals: number,
      rejections: number,
      minQuorum?: number,
    ) =>
      evaluateAssemblyVote({
        policy,
        electorate,
        approvals,
        rejections,
        minQuorum,
      })

    it('passes a majority only with more than half of the ballots', () => {
      expect(vote('assembly_majority', 5, 3, 2).approved).toBe(true)
      expect(vote('assembly_majority', 4, 2, 2)).toMatchObject({
        approved: false,
        reason: 'threshold-not-met',
      })
    })

    it('passes a supermajority at exactly two thirds', () => {
      expect(vote('assembly_supermajority', 3, 2, 1).approved).toBe(true)
      expect(vote('assembly_supermajority', 6, 4, 2).approved).toBe(true)
      expect(vote('assembly_supermajority', 5, 3, 2)).toMatchObject({
        approved: false,
        reason: 'threshold-not-met',
      })
    })

    it('fails below quorum however lopsided the ballots are', () => {
      expect(vote('assembly_majority', 100, 5, 0)).toMatchObject({
        approved: false,
        reason: 'quorum-not-met',
        quorumTarget: 20,
      })
    })

    it('never passes without ballots, even for an empty electorate', () => {
      expect(vote('assembly_majority', 0, 0, 0)).toMatchObject({
        approved: false,
        reason: 'no-ballots',
      })
      expect(vote('assembly_majority', 7, 0, 0).approved).toBe(false)
    })

    it('lets the proposer raise the quorum and never lower it', () => {
      expect(vote('assembly_majority', 100, 25, 0).approved).toBe(true)
      expect(vote('assembly_majority', 100, 25, 0, 40)).toMatchObject({
        approved: false,
        reason: 'quorum-not-met',
        quorumTarget: 40,
      })
      expect(vote('assembly_majority', 100, 3, 0, 1).approved).toBe(false)
    })

    it('counts a single member assembly', () => {
      expect(vote('assembly_majority', 1, 1, 0).approved).toBe(true)
      expect(vote('assembly_majority', 1, 0, 1).approved).toBe(false)
    })
  })

  describe('ASSEMBLY_DECISIONS', () => {
    it('names the same policy as the available-action table', () => {
      for (const [action, { policy }] of Object.entries(ASSEMBLY_DECISIONS)) {
        expect(resolveAvailableAction(action, ['member'])).toMatchObject({
          status: 'requires_approval',
          policy,
        })
      }
    })

    it('does not reopen moderator elections or permanent sanctions', () => {
      for (const action of [
        'moderator.elect',
        'moderator.recall',
        'member.remove',
        'member.block',
      ]) {
        expect(ASSEMBLY_DECISIONS[action]).toBeUndefined()
      }
    })
  })
})
