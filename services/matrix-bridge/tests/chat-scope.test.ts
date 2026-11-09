import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import pg from 'pg'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatModerationEngine } from '../src/chat-moderation.js'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'
import { ingestMatrixEvents } from '../src/matrix-ingestion.js'
import type { RouteContext } from '../src/routes/context.js'
import { routeRequest } from '../src/routes/router.js'

const community = 'at://did:plc:creator/com.para.community.board/chat'
const did = 'did:plc:member'
const retiredTables = [
  'chamber_assignment',
  'sortition_proofs',
  'sortition_runs',
  'sortition_candidates',
  'institution_memberships',
  'chat_participation_stats',
  'deliberation_cards',
  'deliberation_relationships',
  'suggested_relationships',
  'card_votes',
  'community_map_contributions',
  'community_map_contribution_votes',
  'extracted_entities',
  'ai_processing_consent',
  'policy_collections',
  'policy_collection_items',
]

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: chat responsibilities', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let sqlite: Database.Database | undefined
  let schema: string
  let engine: ChatModerationEngine

  async function query(sql: string): Promise<Record<string, unknown>[]> {
    if (sqlite) {
      const statement = sqlite.prepare(sql)
      if (statement.reader) return statement.all() as Record<string, unknown>[]
      statement.run()
      return []
    }
    return (await admin!.query(sql)).rows
  }

  beforeEach(async () => {
    if (driver === 'postgres') {
      schema = `chat_scope_${randomUUID().replaceAll('-', '')}`
      const url = new URL(process.env.MATRIX_TEST_DATABASE_URL!)
      admin = new pg.Pool({ connectionString: url.toString() })
      await admin.query(`CREATE SCHEMA ${schema}`)
      await admin.end()
      url.searchParams.set('options', `-c search_path=${schema}`)
      admin = new pg.Pool({ connectionString: url.toString() })
      db = new PgBridgeDatabase(url.toString())
    } else {
      db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
      sqlite = (db as unknown as { inner: { db: Database.Database } }).inner.db
    }
    engine = new ChatModerationEngine(db, pino({ level: 'silent' }))
    await db.setSpaceForCommunity(community, '!main:para', 'chat', 'bicameral')
    await db.setChamberRooms(community, '!a:para', '!b:para', '!observers:para')
    await db.setCommunityMembership(did, community, 'active', ['member'])
  })

  afterEach(async () => {
    await db.close()
    sqlite = undefined
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
      admin = undefined
    }
  })

  it('initializes only chat data and has no civic storage operations', async () => {
    const rows = await query(
      sqlite
        ? "SELECT name FROM sqlite_master WHERE type = 'table'"
        : 'SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()',
    )
    const tables = rows.map((row) => row.name)
    for (const table of retiredTables) expect(tables).not.toContain(table)
    for (const operation of [
      'insertCard',
      'upsertCardVote',
      'createSortitionRun',
      'setInstitutionMembership',
      'incrementMessageCount',
      'incrementVoteCount',
      'incrementProposalCount',
    ]) {
      expect(operation in db).toBe(false)
    }
  })

  it('leaves archived data intact without treating it as chat authority', async () => {
    await query(
      'CREATE TABLE chamber_assignment (community_uri TEXT, did TEXT, chamber TEXT)',
    )
    await query(
      `INSERT INTO chamber_assignment VALUES ('${community}', '${did}', 'A')`,
    )
    expect(
      (await db.getActiveCommunityRoomsForDid(did)).map((room) => room.roomId),
    ).toEqual(['!main:para'])
    expect(await query('SELECT chamber FROM chamber_assignment')).toEqual([
      { chamber: 'A' },
    ])
    await db.setCommunityMembership(did, community, 'active', [
      'member',
      'moderator',
    ])
    expect(
      (await db.getActiveCommunityRoomsForDid(did))
        .map((room) => room.roomId)
        .sort(),
    ).toEqual(['!a:para', '!b:para', '!main:para', '!observers:para'])
    await db.setCommunityMembership(did, community, 'removed', [])
    expect(await db.getMemberList(community)).toEqual([])
    expect(await db.getActiveCommunityRoomsForDid(did)).toEqual([])
  })

  it('ignores activity badges in existing databases and preserves moderation', async () => {
    for (const badgeType of [
      'voice',
      'voter',
      'proposer',
      'lurker',
      'founder',
    ]) {
      await db.setUserBadge({ did, communityUri: community, badgeType })
    }
    expect(
      await engine.getMemberList(community, 100, 0, {
        did,
        isModerator: false,
      }),
    ).toEqual([{ did, roles: ['member'], badges: [] }])
    await engine.ingestReport({
      reportedDid: did,
      reporterDid: 'did:plc:reporter',
      communityUri: community,
      reason: 'spam',
    })
    expect(
      (await engine.recomputeUser(did, community)).map((badge) => badge.type),
    ).toEqual(['reported'])
    const members = await engine.getMemberList(community, 100, 0, {
      did,
      isModerator: false,
    })
    expect(members[0]).not.toHaveProperty('participation')
    expect(
      await engine.getMemberList(community, 100, 0, {
        did: 'did:plc:other',
        isModerator: false,
      }),
    ).toEqual([{ did, roles: ['member'], badges: [] }])
    const dashboard = await engine.getDashboard(community)
    expect(dashboard).toMatchObject({ totalMembers: 1, reportedThisWeek: 1 })
    expect(dashboard).not.toHaveProperty('activeToday')
    await ingestMatrixEvents(db, [
      {
        eventId: '$message',
        roomId: '!main:para',
        sender: '@member:para',
        type: 'm.room.encrypted',
        originServerTs: Date.now(),
      },
    ])
    expect(await db.getUnreadCount(did, '!main:para')).toBe(1)
    expect(
      (await engine.computeBadges(did, community)).map((badge) => badge.type),
    ).toEqual(['reported'])
  })
})

it('does not dispatch civic, sortition, institution or AI routes', async () => {
  const paths = [
    ['GET', '/api/cards?community=one'],
    ['POST', '/api/cards'],
    ['GET', '/api/graph?community=one'],
    ['POST', '/api/relationships'],
    ['GET', '/api/suggestions?community=one'],
    ['POST', '/api/suggestions/accept'],
    ['POST', '/api/suggestions/reject'],
    ['GET', '/api/community-pulse?community=one'],
    ['GET', '/api/community-tree/contributions?community=one'],
    ['POST', '/api/community-tree/contributions'],
    ['POST', '/api/community-map/contributions/vote'],
    ['POST', '/api/community-tree/contributions/vote'],
    ['GET', '/api/votes?card=one'],
    ['POST', '/api/vote'],
    ['GET', '/api/summarize?community=one'],
    ['POST', '/api/extract'],
    ['GET', '/api/ai-consent'],
    ['POST', '/api/ai-consent'],
    ['GET', '/api/sortition/runs?cabildeo=one'],
    ['POST', '/api/sortition/runs'],
    ['POST', '/api/sortition/runs/process'],
    ['GET', '/api/sortition-proofs?community=one'],
    ['GET', '/api/sortition-proof?did=one'],
    ['POST', '/api/verify-sortition'],
    ['GET', '/api/sortition-proof-as-record?did=one'],
    ['POST', '/api/institutions'],
    ['GET', '/api/institution/members?institutionId=one'],
    ['POST', '/api/institution/members'],
    ['POST', '/api/institution/members/revoke'],
  ]
  for (const matrixChatEnabled of [true, false]) {
    for (const [method, url] of paths) {
      const matched = await routeRequest(
        { method, url } as never,
        {} as never,
        { config: { matrixChatEnabled } } as RouteContext,
      )
      expect({ method, url, matched }).toEqual({ method, url, matched: false })
    }
  }
})
