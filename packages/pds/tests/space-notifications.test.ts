import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { TID } from '@atproto/common'
import {
  type AccountDb,
  getDb,
  getMigrator,
} from '../src/account-manager/db/index.js'
import {
  type SpaceNotification,
  SpaceNotifications,
} from '../src/space-notifications.js'

const space =
  'at://did:plc:ragtjsm2j2vknwkz3zp4oxrd/space/com.para.space.community/board'
const repo = 'did:web:member.example'

describe('durable space notifications', () => {
  let directory: string
  let db: AccountDb
  let now: number
  const clock = () => now
  const body = (repoRev: string): SpaceNotification => ({
    space,
    repo,
    repoRev,
    hash: new Uint8Array(32).fill(7),
  })

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'watzappa-space-notify-'))
    db = getDb(path.join(directory, 'account.sqlite'))
    await getMigrator(db).migrateToLatestOrThrow()
    now = Date.now()
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('persists a failed delivery, coalesces to the latest rev, and retries after restart', async () => {
    const first = TID.nextStr()
    const second = TID.nextStr(first)
    const delivered: string[] = []
    const failing = new SpaceNotifications(
      db,
      async () => {
        throw new Error('temporary')
      },
      () => true,
      clock,
    )
    await failing.notify(body(first))
    await failing.notify(body(second))
    await failing.notify(body(first))
    const queued = await db.db
      .selectFrom('space_notification_retry')
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(queued.repoRev).toBe(second)
    now += 60_000
    const restarted = new SpaceNotifications(
      db,
      async (notification) => {
        delivered.push(notification.repoRev)
      },
      () => true,
      clock,
    )
    await restarted.retryPending()
    expect(delivered).toEqual([second])
    expect(
      await db.db.selectFrom('space_notification_retry').selectAll().execute(),
    ).toEqual([])
    await failing.destroy()
    await restarted.destroy()
  })

  it('does not retain a permanent rejection', async () => {
    const sender = new SpaceNotifications(
      db,
      async () => {
        throw new Error('denied')
      },
      () => false,
      clock,
    )
    await sender.notify(body(TID.nextStr()))
    expect(
      await db.db.selectFrom('space_notification_retry').selectAll().execute(),
    ).toEqual([])
    await sender.destroy()
  })

  it('retains upstream credential-revocation storage alongside retries', async () => {
    const revoked = {
      space,
      jti: 'credential-jti',
      expiresAt: new Date(now + 60_000).toISOString(),
    }
    await db.db.insertInto('revoked_space_credential').values(revoked).execute()
    expect(
      await db.db
        .selectFrom('revoked_space_credential')
        .selectAll()
        .executeTakeFirst(),
    ).toEqual(revoked)
  })
})
