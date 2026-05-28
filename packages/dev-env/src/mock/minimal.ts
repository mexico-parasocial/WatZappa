import { AtpAgent } from '@atproto/api'
import { TestNetwork } from '../index.js'

const MOCK_USER_PASSWORD = process.env.MOCK_USER_PASSWORD || 'hunter2'
const MOCK_MOD_PASSWORD = process.env.MOCK_MOD_PASSWORD || 'mod-pass'
const MOCK_TRIAGE_PASSWORD = process.env.MOCK_TRIAGE_PASSWORD || 'triage-pass'
const MOCK_ADMIN_MOD_PASSWORD =
  process.env.MOCK_ADMIN_MOD_PASSWORD || 'admin-mod-pass'

/**
 * Minimal mock setup for PARA dev environment.
 * Creates only essential users and follow relationships.
 * Does NOT create generic posts, replies, or likes —
 * those are created by paraDemoSeed instead.
 */
export async function generateMinimalMockSetup(env: TestNetwork) {
  const users = [
    {
      email: 'alice@test.com',
      handle: `alice.test`,
      password: MOCK_USER_PASSWORD,
      displayName: 'Alice',
      description: 'Test user 0',
    },
    {
      email: 'bob@test.com',
      handle: `bob.test`,
      password: MOCK_USER_PASSWORD,
      displayName: 'Bob',
      description: 'Test user 1',
    },
    {
      email: 'carla@test.com',
      handle: `carla.test`,
      password: MOCK_USER_PASSWORD,
      displayName: 'Carla',
      description: 'Test user 2',
    },
    {
      email: 'triage@test.com',
      handle: 'triage.test',
      password: MOCK_TRIAGE_PASSWORD,
    },
    {
      email: 'mod@test.com',
      handle: 'mod.test',
      password: MOCK_MOD_PASSWORD,
    },
    {
      email: 'admin-mod@test.com',
      handle: 'admin-mod.test',
      password: MOCK_ADMIN_MOD_PASSWORD,
    },
    {
      email: 'labeler@test.com',
      handle: 'labeler.test',
      password: MOCK_USER_PASSWORD,
      displayName: 'Test Labeler',
      description: 'Labeling things across the atmosphere',
    },
  ]

  const userAgents = await Promise.all(
    users.map(async (user) => {
      const agent: AtpAgent = env.pds.getAgent()
      try {
        await agent.createAccount(user)
      } catch (e: any) {
        if (
          e.status === 400 &&
          e.error === 'InvalidRequest' &&
          e.message?.includes('Handle already taken')
        ) {
          await agent.login({
            identifier: user.handle,
            password: user.password,
          })
        } else {
          throw e
        }
      }
      agent.assertAuthenticated()
      if (user.displayName || user.description) {
        await agent.upsertProfile((prev) => {
          return {
            ...prev,
            displayName: user.displayName,
            description: user.description,
          }
        })
      }
      return agent
    }),
  )

  const [alice, bob, carla, triage, mod, adminMod, labeler] = userAgents

  // Create chat declarations for all users
  for (const user of userAgents) {
    await user.com.atproto.repo.putRecord({
      repo: user.did,
      collection: 'chat.bsky.actor.declaration',
      rkey: 'self',
      record: { allowIncoming: 'all' },
    })
  }

  // Add moderator roles
  await env.ozone.addTriageDid(triage.did)
  await env.ozone.addModeratorDid(mod.did)
  await env.ozone.addAdminDid(adminMod.did)

  // everybody follows everybody
  const follow = async (author: AtpAgent, subject: AtpAgent) => {
    await author.app.bsky.graph.follow.create(
      { repo: author.assertDid },
      {
        subject: subject.assertDid,
        createdAt: new Date().toISOString(),
      },
    )
  }
  await follow(alice, bob)
  await follow(alice, carla)
  await follow(bob, alice)
  await follow(bob, carla)
  await follow(carla, alice)
  await follow(carla, bob)

  // Create labeler service
  await labeler.com.atproto.repo.putRecord({
    repo: labeler.did,
    collection: 'app.bsky.labeler.service',
    rkey: 'self',
    record: {
      policies: {
        labelValues: [
          '!hide',
          'porn',
          'rude',
          'spam',
          'spider',
          'misinfo',
          'cool',
          'curate',
        ],
        labelValueDefinitions: [
          {
            identifier: 'rude',
            blurs: 'content',
            severity: 'alert',
            defaultSetting: 'warn',
            adultOnly: true,
            locales: [
              {
                lang: 'en',
                name: 'Rude',
                description: 'Just such a jerk, you wouldnt believe it.',
              },
            ],
          },
          {
            identifier: 'spam',
            blurs: 'content',
            severity: 'inform',
            defaultSetting: 'hide',
            locales: [
              {
                lang: 'en',
                name: 'Spam',
                description:
                  'Low quality posts that dont add to the conversation.',
              },
            ],
          },
        ],
      },
      createdAt: new Date().toISOString(),
    },
  })

  // Ensure AppView indexes actors before seeding posts
  await env.processAll()
}
