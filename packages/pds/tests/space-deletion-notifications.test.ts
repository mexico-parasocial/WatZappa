import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { XrpcResponseError } from '@atproto/lex'
import type { SpaceRefString } from '@atproto/syntax'
import {
  type AccountDb,
  getDb,
  getMigrator,
} from '../src/account-manager/db/index.js'
import { com } from '../src/lexicons/index.js'
import {
  SpaceDeletionNotifications,
  type SpaceDeletionState,
} from '../src/space-deletion-notifications.js'

const space: SpaceRefString =
  'at://did:web:authority.example/space/com.para.space.personal/notes'
const service = 'did:web:syncer.example#atproto_space_syncer'

describe('durable space deletion notifications', () => {
  let db: AccountDb
  let directory: string
  let now: number
  let state: SpaceDeletionState

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'para-space-deletion-'))
    db = getDb(path.join(directory, 'account.sqlite'))
    await getMigrator(db).migrateToLatestOrThrow()
    now = Date.now()
    state = 'deleted'
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  const recipients = () => [
    { serviceDid: service, expiresAt: new Date(now + 3_600_000).toISOString() },
  ]
  const queued = () =>
    db.db.selectFrom('space_deleted_notification_retry').selectAll().execute()
  const queue = (
    deliver: ConstructorParameters<
      typeof SpaceDeletionNotifications
    >[1]['deliver'],
  ) =>
    new SpaceDeletionNotifications(
      db,
      { state: async () => state, deliver },
      () => now,
    )

  it('persists before delivery and retries a transient failure after restart', async () => {
    let attempts = 0
    const first = queue(async () => {
      attempts++
      throw new Error('offline')
    })
    await first.enqueue(space, recipients())
    expect(attempts).toBe(0)
    await first.retryPending()
    expect((await queued())[0].attempts).toBe(1)
    await first.destroy()
    now += 60_000
    await using restarted = queue(async (gotSpace, gotService) => {
      expect(gotSpace).toBe(space)
      expect(gotService).toBe(service)
    })
    await restarted.retryPending()
    expect(await queued()).toEqual([])
  })

  it('stops retrying a permanent HTTP rejection', async () => {
    await using sender = queue(async () => {
      throw new XrpcResponseError(
        com.atproto.space.notifySpaceDeleted.main,
        new Response(null, { status: 403 }),
      )
    })
    await sender.enqueue(space, recipients())
    await sender.retryPending()
    expect(await queued()).toEqual([])
  })

  it('expires with the registration without contacting the syncer', async () => {
    let calls = 0
    await using sender = queue(async () => {
      calls++
    })
    await sender.enqueue(space, recipients())
    now += 3_600_001
    await sender.retryPending()
    expect(calls).toBe(0)
    expect(await queued()).toEqual([])
  })

  it.each(['active', 'missing'] as const)(
    'drops obsolete deletion when the space is %s',
    async (current) => {
      let calls = 0
      state = current
      await using sender = queue(async () => {
        calls++
      })
      await sender.enqueue(space, recipients())
      await sender.retryPending()
      expect(calls).toBe(0)
      expect(await queued()).toEqual([])
    },
  )

  it('defers a paused account and resumes after it is active', async () => {
    let calls = 0
    state = 'paused'
    await using sender = queue(async () => {
      calls++
    })
    await sender.enqueue(space, recipients())
    await sender.retryPending()
    expect(calls).toBe(0)
    expect((await queued())[0].attempts).toBe(1)
    now += 60_000
    state = 'deleted'
    await sender.retryPending()
    expect(calls).toBe(1)
    expect(await queued()).toEqual([])
  })

  it('fences a newer deletion from an earlier in-flight delivery', async () => {
    let calls = 0
    await using sender = queue(async () => {
      if (++calls === 1) {
        await sender.enqueue(space, [
          {
            serviceDid: service,
            expiresAt: new Date(now + 7_200_000).toISOString(),
          },
        ])
      }
      throw new Error('offline')
    })
    await sender.enqueue(space, recipients())
    const initial = (await queued())[0]
    await sender.retryPending()
    const newer = (await queued())[0]
    expect(calls).toBe(2)
    expect(newer.generation).not.toBe(initial.generation)
    expect(newer.attempts).toBe(1)
    expect(newer.expiresAt).toBe(now + 7_200_000)
  })

  it('lets only the lease owner deliver a pending batch', async () => {
    let unblock: () => void = () => undefined
    let started: () => void = () => undefined
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      unblock = resolve
    })
    let competingCalls = 0
    await using first = queue(async () => {
      started()
      await gate
    })
    await using second = queue(async () => {
      competingCalls++
    })
    await first.enqueue(space, recipients())
    const delivery = first.retryPending()
    await ready
    await second.retryPending()
    expect(competingCalls).toBe(0)
    unblock()
    await delivery
    expect(await queued()).toEqual([])
  })
})
