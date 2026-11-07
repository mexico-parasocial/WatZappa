import {
  getRoleDefinitions,
  resolveAvailableAction,
} from './community-authority.js'

describe('community authority policy', () => {
  describe('role definitions', () => {
    it('describe owner appointment of moderators and an owner role', () => {
      const definitions = getRoleDefinitions('open')
      expect(definitions.map((definition) => definition.role)).toEqual([
        'visitor',
        'member',
        'moderator',
        'owner',
        'assembly',
      ])
      const moderator = definitions.find((d) => d.role === 'moderator')
      expect(moderator?.howToObtain).toMatch(/appointment from the owner/)
    })

    it('do not mention elections or term limits', () => {
      const text = JSON.stringify(getRoleDefinitions('assembly_approval'))
      expect(text).not.toMatch(/\belect|90-day|\bterm\b/i)
    })

    it('depend on the admission mode only through how a member joins', () => {
      const open = getRoleDefinitions('open')
      const gated = getRoleDefinitions('assembly_approval')
      expect(open.find((d) => d.role === 'member')?.howToObtain).not.toEqual(
        gated.find((d) => d.role === 'member')?.howToObtain,
      )
      expect(open.filter((d) => d.role !== 'member')).toEqual(
        gated.filter((d) => d.role !== 'member'),
      )
    })
  })

  describe('protected actions', () => {
    it('route permanent sanctions through the owner on a moderator proposal', () => {
      for (const action of ['member.remove', 'member.block']) {
        expect(resolveAvailableAction(action, ['member'])).toEqual({
          action,
          status: 'requires_approval',
          policy: 'owner_after_moderator_proposal',
        })
      }
    })

    it('route moderator changes and appeals to the owner', () => {
      expect(
        resolveAvailableAction('moderator.elect', ['member']),
      ).toMatchObject({
        status: 'requires_approval',
        policy: 'owner_appointment',
      })
      expect(
        resolveAvailableAction('moderator.recall', ['member']),
      ).toMatchObject({ status: 'requires_approval', policy: 'owner_action' })
      expect(
        resolveAvailableAction('moderation.appeal', ['member']),
      ).toMatchObject({ status: 'requires_approval', policy: 'owner_review' })
    })

    it('keep temporary suspension with a single moderator', () => {
      expect(
        resolveAvailableAction('member.suspendTemporary', [
          'member',
          'moderator',
        ]),
      ).toMatchObject({ status: 'allowed', policy: 'single_actor' })
      expect(
        resolveAvailableAction('member.suspendTemporary', ['member']),
      ).toMatchObject({ status: 'denied' })
    })

    it('deny protected actions to non-members', () => {
      expect(resolveAvailableAction('member.block', [])).toMatchObject({
        status: 'denied',
        policy: 'role_required',
      })
    })
  })
})
