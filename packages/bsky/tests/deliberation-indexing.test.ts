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

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'deliberation_indexing_test',
    })
    sc = network.getSeedClient()
    db = network.bsky.db
    await usersSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  describe('reactions to a position on a cabildeo', () => {
    const POSITIONS = 'com.para.civic.listCabildeoPositions'
    let cabildeo: string

    const writePosition = async (by: string, stance: string, text: string) => {
      const { data } = await sc.agent.com.atproto.repo.createRecord(
        {
          repo: by,
          collection: 'com.para.civic.position',
          record: {
            $type: 'com.para.civic.position',
            cabildeo,
            stance,
            text,
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(by) },
      )
      await network.processAll()
      return data
    }

    const listPositions = async (viewer: string, stance?: string) => {
      const url = new URL(`/xrpc/${POSITIONS}`, network.bsky.url)
      url.searchParams.set('cabildeo', cabildeo)
      if (stance) url.searchParams.set('stance', stance)
      const res = await request(url, {
        headers: await network.serviceHeaders(viewer, POSITIONS),
      })
      if (res.statusCode !== 200) {
        throw new Error(`Expected 200 from ${POSITIONS}, got ${res.statusCode}`)
      }
      return (await res.body.json()) as any
    }

    beforeAll(() => {
      cabildeo = `at://${sc.dids.alice}/com.para.civic.cabildeo/3lcab0000001`
    })

    it('keeps a question apart from the sides', async () => {
      const ref = await writePosition(
        sc.dids.dan,
        'question',
        '¿Quién paga el mantenimiento?',
      )
      const asked = await listPositions(sc.dids.alice, 'question')
      expect(asked.positions.map((p: any) => p.uri)).toEqual([ref.uri])
      expect(asked.positions[0].stance).toBe('question')
    })

    it('serves the counts, and only the viewer own reaction', async () => {
      const position = await writePosition(sc.dids.dan, 'for', 'Hagámoslo.')
      await weigh(sc.dids.alice, position.uri, 'agree')
      await weigh(sc.dids.bob, position.uri, 'agree')
      await weigh(sc.dids.carol, position.uri, 'pass')

      const data = await listPositions(sc.dids.alice, 'for')
      const row = data.positions.find((p: any) => p.uri === position.uri)
      expect(row).toBeDefined()
      expect(row.agreeCount).toBe(2)
      expect(row.disagreeCount).toBe(0)
      expect(row.passCount).toBe(1)
      expect(row.viewerDirection).toBe('agree')
      expect(JSON.stringify(row)).not.toContain(sc.dids.bob)
    })

    it('records which side someone took', async () => {
      const position = await writePosition(
        sc.dids.dan,
        'for',
        'Con presupuesto.',
      )
      const ref = await weigh(sc.dids.alice, position.uri, 'disagree')

      const row = await db.db
        .selectFrom('para_deliberation_vote')
        .selectAll()
        .where('uri', '=', ref.uri)
        .executeTakeFirst()

      expect(row?.creator).toBe(sc.dids.alice)
      expect(row?.statement).toBe(position.uri)
      expect(row?.direction).toBe('disagree')
    })

    it('replaces a reaction rather than accumulating it', async () => {
      const position = await writePosition(sc.dids.dan, 'for', 'Reconsidérame.')
      await weigh(sc.dids.alice, position.uri, 'agree')
      await weigh(sc.dids.alice, position.uri, 'disagree')

      const rows = await db.db
        .selectFrom('para_deliberation_vote')
        .selectAll()
        .where('statement', '=', position.uri)
        .where('creator', '=', sc.dids.alice)
        .execute()

      expect(rows).toHaveLength(1)
      expect(rows[0].direction).toBe('disagree')
    })

    it('no longer indexes a reaction to a retired argument record', async () => {
      const ref = await weigh(
        sc.dids.alice,
        `at://${sc.dids.dan}/com.para.community.deliberation/3lold00000001`,
        'agree',
      )
      const row = await db.db
        .selectFrom('para_deliberation_vote')
        .selectAll()
        .where('uri', '=', ref.uri)
        .executeTakeFirst()
      expect(row).toBeUndefined()
    })

    it('does not index a reaction to anything but an argument', async () => {
      const ref = await weigh(
        sc.dids.alice,
        `at://${sc.dids.dan}/app.bsky.feed.post/3lpost0000001`,
        'agree',
      )
      const row = await db.db
        .selectFrom('para_deliberation_vote')
        .selectAll()
        .where('uri', '=', ref.uri)
        .executeTakeFirst()
      expect(row).toBeUndefined()
    })
  })
})
