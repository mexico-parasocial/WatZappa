// @ts-nocheck
import { request } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// Deliberation is attributable by design, so it sits outside the ballot freeze
// (OD-7 §5c), and deliberately unweighted: a position on an argument is for or
// against, with no magnitude behind it (§5f).
maybeDescribe('deliberation indexing', () => {
  let network: TestNetwork
  let sc: SeedClient
  let db: any
  let proposal: string

  const writeStatement = async (by: string, body: string, stance: string) => {
    const { data } = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: by,
        collection: 'com.para.community.deliberation',
        record: {
          $type: 'com.para.community.deliberation',
          proposal,
          author: by,
          body,
          stance,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(by) },
    )
    await network.processAll()
    return data
  }

  const weigh = async (by: string, deliberation: string, direction: string) => {
    const { data } = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: by,
        collection: 'com.para.community.deliberationVote',
        record: {
          $type: 'com.para.community.deliberationVote',
          deliberation,
          voter: by,
          direction,
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(by) },
    )
    await network.processAll()
    return data
  }

  const NSID = 'com.para.community.listDeliberations'

  const listDeliberations = async (viewer: string) => {
    const url = new URL(`/xrpc/${NSID}`, network.bsky.url)
    url.searchParams.set('proposal', proposal)
    const res = await request(url, {
      headers: await network.serviceHeaders(viewer, NSID),
    })
    if (res.statusCode !== 200) {
      throw new Error(`Expected 200 from ${NSID}, got ${res.statusCode}`)
    }
    return (await res.body.json()) as any
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'deliberation_indexing_test',
    })
    sc = network.getSeedClient()
    db = network.bsky.db
    await usersSeed(sc)
    await network.processAll()
    proposal = `at://${sc.dids.alice}/com.para.community.proposal/3lprop0sal001`
  })

  afterAll(async () => {
    await network.close()
  })

  it('indexes an argument', async () => {
    const ref = await writeStatement(sc.dids.dan, 'La banqueta primero.', 'for')

    const row = await db.db
      .selectFrom('para_deliberation_statement')
      .selectAll()
      .where('uri', '=', ref.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.dan)
    expect(row?.proposal).toBe(proposal)
    expect(row?.body).toBe('La banqueta primero.')
    expect(row?.stance).toBe('for')
  })

  it('records which side someone took', async () => {
    const statement = await writeStatement(
      sc.dids.dan,
      'Con presupuesto.',
      'for',
    )
    const ref = await weigh(sc.dids.alice, statement.uri, 'disagree')

    const row = await db.db
      .selectFrom('para_deliberation_vote')
      .selectAll()
      .where('uri', '=', ref.uri)
      .executeTakeFirst()

    expect(row?.creator).toBe(sc.dids.alice)
    expect(row?.statement).toBe(statement.uri)
    expect(row?.direction).toBe('disagree')
  })

  it('serves the counts, and only the viewer own position', async () => {
    const statement = await writeStatement(sc.dids.dan, 'Súmense.', 'for')
    await weigh(sc.dids.alice, statement.uri, 'agree')
    await weigh(sc.dids.bob, statement.uri, 'agree')
    await weigh(sc.dids.carol, statement.uri, 'disagree')

    const data = await listDeliberations(sc.dids.alice)
    const row = data.statements.find((s: any) => s.uri === statement.uri)
    expect(row).toBeDefined()
    expect(row.agreeCount).toBe(2)
    expect(row.disagreeCount).toBe(1)
    expect(row.viewerDirection).toBe('agree')
  })

  it('replaces a position rather than accumulating it', async () => {
    const statement = await writeStatement(sc.dids.dan, 'Reconsidérame.', 'for')
    await weigh(sc.dids.alice, statement.uri, 'agree')
    await weigh(sc.dids.alice, statement.uri, 'disagree')

    const rows = await db.db
      .selectFrom('para_deliberation_vote')
      .selectAll()
      .where('statement', '=', statement.uri)
      .where('creator', '=', sc.dids.alice)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].direction).toBe('disagree')
  })
})
