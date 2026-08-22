import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteBridgeDatabase } from '../db/index.js'

// The engine is deterministic given a beacon; only the network is faked.
vi.mock('../drand.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../drand.js')>()
  return {
    ...actual,
    fetchBeacon: vi.fn(async () => ({
      round: 4_567_890,
      randomness: 'feedbeef'.repeat(8),
      signature: 'test-signature',
    })),
  }
})

// Push delivery must never leave the machine in tests.
vi.mock('../push.js', () => ({
  sendExpoNotifications: vi.fn(async () => {}),
}))

const { createSortitionEngine } = await import('../sortition-runs.js')
const { sendExpoNotifications } = await import('../push.js')

const COMMUNITY = 'at://did:plc:creator/com.para.community.board/testcom'
const CABILDEO = 'at://did:plc:creator/com.para.cabildeo/asm1'

const silentLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as any

async function seedMembers(db: SqliteBridgeDatabase, dids: string[]) {
  for (const did of dids) {
    await db.ensureParticipationStats(did, COMMUNITY, `!room-${did.slice(-4)}`)
  }
}

async function seedRun(
  db: SqliteBridgeDatabase,
  opts: { id: string; assemblySize?: number; eligibilityFilter?: string },
) {
  await db.createSortitionRun({
    id: opts.id,
    cabildeoUri: CABILDEO,
    communityUri: COMMUNITY,
    createdByDid: 'did:plc:creator',
    assemblySize: opts.assemblySize ?? 2,
    eligibilityFilter: opts.eligibilityFilter ?? 'all',
    drandRound: 4_567_890,
    configRecordJson: JSON.stringify({ assemblySize: opts.assemblySize ?? 2 }),
    createdAt: new Date().toISOString(),
  })
}

describe('sortition engine', () => {
  let db: SqliteBridgeDatabase
  let dbPath: string

  beforeEach(() => {
    vi.mocked(sendExpoNotifications).mockClear()
    dbPath = path.join(os.tmpdir(), `para-sortition-test-${Date.now()}.db`)
    db = new SqliteBridgeDatabase({ dbPath } as any)
  })

  afterEach(async () => {
    await db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // cleanup may fail if file didn't exist
    }
  })

  it('selects exactly assemblySize members, ranked by hash, with the threshold recorded', async () => {
    await seedMembers(db, [
      'did:plc:member0001',
      'did:plc:member0002',
      'did:plc:member0003',
      'did:plc:member0004',
      'did:plc:member0005',
    ])
    await seedRun(db, { id: 'run-1', assemblySize: 2 })
    const engine = createSortitionEngine(db, silentLog)

    const result = await engine.processRun('run-1')

    expect(result.run?.status).toBe('active')
    expect(result.run?.selectedCount).toBe(2)
    expect(result.run?.eligibleCount).toBe(5)
    expect(result.selected).toHaveLength(2)
    expect(result.selected!.every((c: any) => c.selected)).toBe(true)

    const all = (await db.getSortitionCandidates('run-1')) as any[]
    expect(all).toHaveLength(5)
    const hashValues = all.map((c) => c.hash_value)
    const sorted = [...hashValues].sort((a, b) => a - b)
    expect(hashValues).toEqual(sorted) // stored in ranked order
    const selectedRows = all.filter((c) => c.selected === 1)
    expect(selectedRows.map((c) => c.hash_value)).toEqual(sorted.slice(0, 2))
    // threshold is the hash of the last selected member
    expect(result.run?.threshold).toBe(sorted[1])
  })

  it('is deterministic: reprocessing identical inputs selects the same assembly', async () => {
    await seedMembers(db, [
      'did:plc:aaa1',
      'did:plc:bbb2',
      'did:plc:ccc3',
      'did:plc:ddd4',
    ])
    await seedRun(db, { id: 'run-a', assemblySize: 2 })
    const engine = createSortitionEngine(db, silentLog)

    const first = await engine.processRun('run-a')

    // Wipe the run entirely (cabildeo_uri is UNIQUE) and recreate it identical.
    const raw = (db as any).inner.db
    raw.prepare('DELETE FROM sortition_candidates WHERE run_id = ?').run('run-a')
    raw.prepare('DELETE FROM sortition_runs WHERE id = ?').run('run-a')
    await seedRun(db, { id: 'run-a', assemblySize: 2 })

    const second = await engine.processRun('run-a')

    expect(second.selected!.map((c: any) => c.did)).toEqual(
      first.selected!.map((c: any) => c.did),
    )
    expect(second.run?.threshold).toBe(first.run?.threshold)
  })

  it('is idempotent: an active run returns its selection without reprocessing or re-notifying', async () => {
    await seedMembers(db, ['did:plc:m1', 'did:plc:m2', 'did:plc:m3'])
    await seedRun(db, { id: 'run-1', assemblySize: 1 })
    const engine = createSortitionEngine(db, silentLog)

    const first = await engine.processRun('run-1')
    expect(sendExpoNotifications).toHaveBeenCalledTimes(1)

    const second = await engine.processRun('run-1')

    expect(second.run?.status).toBe('active')
    expect(second.selected!.map((c: any) => c.did)).toEqual(
      first.selected!.map((c: any) => c.did),
    )
    expect(sendExpoNotifications).toHaveBeenCalledTimes(1)
    // no duplicate candidate rows
    expect(await db.getSortitionCandidates('run-1')).toHaveLength(3)
  })

  it("fails the run when the 'senior' filter leaves nobody eligible", async () => {
    // ensureParticipationStats stamps joined_at = now, so nobody is a year in.
    await seedMembers(db, ['did:plc:newbie1', 'did:plc:newbie2'])
    await seedRun(db, { id: 'run-senior', eligibilityFilter: 'senior' })
    const engine = createSortitionEngine(db, silentLog)

    await expect(engine.processRun('run-senior')).rejects.toThrow(
      'No eligible community members found for this sortition',
    )

    const failed = (await db.getSortitionRun('run-senior')) as any
    expect(failed.status).toBe('failed')
  })

  it("includes members older than a year under the 'senior' filter", async () => {
    await seedMembers(db, ['did:plc:elder', 'did:plc:newbie'])
    // Backdate only one member's join.
    ;(db as any).inner.db
      .prepare(
        "UPDATE chat_participation_stats SET joined_at = datetime('now', '-2 years') WHERE did = ?",
      )
      .run('did:plc:elder')
    await seedRun(db, { id: 'run-senior2', eligibilityFilter: 'senior' })
    const engine = createSortitionEngine(db, silentLog)

    const result = await engine.processRun('run-senior2')

    expect(result.run?.eligibleCount).toBe(1)
    expect(result.selected?.[0]?.did).toBe("did:plc:elder")
  })

  it('processScheduled drains scheduled runs and reports them active', async () => {
    await seedMembers(db, ['did:plc:s1', 'did:plc:s2', 'did:plc:s3'])
    await seedRun(db, { id: 'sched-1', assemblySize: 2 })
    const engine = createSortitionEngine(db, silentLog)

    await engine.processScheduled()

    const run = (await db.getSortitionRun('sched-1')) as any
    expect(run.status).toBe('active')
    expect(run!.selected_count).toBe(2)
  })
})
