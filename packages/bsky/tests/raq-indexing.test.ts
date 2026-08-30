// @ts-nocheck
import AtpAgent from '@atproto/api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  SeedClient,
  TestNetwork,
  createRaqAssessmentRecord,
  createRaqAxisVoteRecord,
  createRaqProposalRecord,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// The test schema persists between runs; nullifiers must be unique per run or
// earlier runs' rows poison the dedup assertions.
const runId = Date.now().toString(36)

maybeDescribe('RAQ indexing and queries', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient
  let db: any

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'raq_indexing_test',
    })
    agent = network.bsky.getClient()
    sc = network.getSeedClient()
    db = network.bsky.db
    await usersSeed(sc)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('indexes an assessment record into raq_assessment', async () => {
    const assessmentRef = await writeParaFixture(network, async () => {
      return createRaqAssessmentRecord(sc, sc.dids.alice, {
        answers: [
          { questionId: 'q1', value: 2 },
          { questionId: 'q2', value: -1 },
        ],
        results: [
          {
            axisId: 'economy',
            axisTitle: 'Economy',
            score: 65,
            label: 'Planning',
            labelLow: 'Market',
            labelHigh: 'Planning',
            rawScore: 4,
          },
        ],
        compass: { x: -300, y: 200, ninth: 'auth-left' },
        ideology: {
          name: 'Social Democrat',
          description: 'Believes in strong public services.',
          matchPercent: 87,
        },
        isPublic: true,
      })
    })

    const row = await db.db
      .selectFrom('raq_assessment')
      .selectAll()
      .where('uri', '=', assessmentRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.alice)
    expect(row?.isPublic).toBe(true)
    expect(row?.completedAt).toBeDefined()
  })

  it('indexes an axis vote record into raq_axis_vote', async () => {
    const voteRef = await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.bob, {
        axisId: 'ecology-growth',
        value: 1,
      })
    })

    const row = await db.db
      .selectFrom('raq_axis_vote')
      .selectAll()
      .where('uri', '=', voteRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.bob)
    expect(row?.axisId).toBe('ecology-growth')
    expect(row?.value).toBe(1)
  })

  it('deduplicates RAQ axis votes by m8 vote nullifier', async () => {
    const voteNullifier = `m8-raq-axis-shared-person-${runId}`
    await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.bob, {
        axisId: 'housing-density',
        value: 1,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:axis-bob',
      })
    })
    await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.carol, {
        axisId: 'housing-density',
        value: -1,
        voteNullifier,
        eligibilityProofRef: 'm8:civic-vote-proof:axis-carol',
      })
    })

    const rows = await db.db
      .selectFrom('raq_axis_vote')
      .selectAll()
      .where('axisId', '=', 'housing-density')
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.carol)
    expect(rows[0].value).toBe(-1)
  })

  it('indexes a proposal record into raq_proposal', async () => {
    const proposalRef = await writeParaFixture(network, async () => {
      return createRaqProposalRecord(sc, sc.dids.dan, {
        text: 'Should public transportation be free?',
        targetCommunity: 'jalisco',
      })
    })

    const row = await db.db
      .selectFrom('raq_proposal')
      .selectAll()
      .where('uri', '=', proposalRef.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.creator).toBe(sc.dids.dan)
    expect(row?.text).toBe('Should public transportation be free?')
    expect(row?.targetCommunity).toBe('jalisco')
  })

  it('deduplicates RAQ proposal votes by m8 vote nullifier', async () => {
    const proposalRef = await writeParaFixture(network, async () => {
      return createRaqProposalRecord(sc, sc.dids.alice, {
        text: 'Should parks stay open late?',
        targetCommunity: 'jalisco',
      })
    })
    const voteNullifier = `m8-raq-proposal-shared-person-${runId}`
    await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.createRecord(
        {
          repo: sc.dids.bob,
          collection: 'com.para.raq.proposalVote',
          record: {
            $type: 'com.para.raq.proposalVote',
            subject: proposalRef.uri,
            value: 1,
            voteNullifier,
            eligibilityProofRef: 'm8:civic-vote-proof:proposal-bob',
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.bob) },
      )
    })
    await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.createRecord(
        {
          repo: sc.dids.carol,
          collection: 'com.para.raq.proposalVote',
          record: {
            $type: 'com.para.raq.proposalVote',
            subject: proposalRef.uri,
            value: -1,
            voteNullifier,
            eligibilityProofRef: 'm8:civic-vote-proof:proposal-carol',
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.carol) },
      )
    })

    const rows = await db.db
      .selectFrom('raq_proposal_vote')
      .selectAll()
      .where('subject', '=', proposalRef.uri)
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    expect(rows[0].creator).toBe(sc.dids.carol)
    expect(rows[0].value).toBe(-1)
  })

  it('returns user alignment via getUserAlignment', async () => {
    const qs = new URLSearchParams({ did: sc.dids.alice }).toString()
    const res = await fetch(
      `${network.bsky.url}/xrpc/com.para.raq.getUserAlignment?${qs}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.assessment).toBeDefined()
    expect(body.assessment.results.length).toBeGreaterThan(0)
    expect(body.assessment.compass).toBeDefined()
    expect(body.assessment.ideology).toBeDefined()
  })

  it('returns empty alignment for user without public assessment', async () => {
    // Create a private assessment
    await writeParaFixture(network, async () => {
      return createRaqAssessmentRecord(sc, sc.dids.bob, {
        answers: [{ questionId: 'q1', value: 0 }],
        results: [
          {
            axisId: 'test',
            axisTitle: 'Test',
            score: 50,
            label: 'Neutral',
            labelLow: 'Low',
            labelHigh: 'High',
            rawScore: 0,
          },
        ],
        compass: { x: 0, y: 0, ninth: 'center' },
        ideology: {
          name: 'Centrist',
          description: 'Neutral.',
          matchPercent: 50,
        },
        isPublic: false,
      })
    })

    const qs = new URLSearchParams({ did: sc.dids.bob }).toString()
    const res = await fetch(
      `${network.bsky.url}/xrpc/com.para.raq.getUserAlignment?${qs}`,
    )
    expect(res.status).toBe(400)
  })

  it('lets the viewer read their own private assessment', async () => {
    const qs = new URLSearchParams({ did: sc.dids.bob }).toString()
    const res = await fetch(
      `${network.bsky.url}/xrpc/com.para.raq.getUserAlignment?${qs}`,
      {
        headers: await network.serviceHeaders(
          sc.dids.bob,
          'com.para.raq.getUserAlignment',
        ),
      },
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.assessment).toBeDefined()
    expect(body.assessment.results.length).toBeGreaterThan(0)
  })

  it('updates an assessment record in place (upsert by uri)', async () => {
    const ref = await writeParaFixture(network, async () => {
      return createRaqAssessmentRecord(sc, sc.dids.alice, {
        answers: [{ questionId: 'q1', value: 1 }],
        results: [
          {
            axisId: 'economy',
            axisTitle: 'Economy',
            score: 10,
            label: 'Market',
            labelLow: 'Market',
            labelHigh: 'Planning',
            rawScore: 1,
          },
        ],
        compass: { x: 300, y: -200, ninth: 'lib-right' },
        ideology: { name: 'Liberal', description: '.', matchPercent: 40 },
        isPublic: true,
      })
    })
    const rkey = ref.uri.split('/').pop()

    await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.putRecord(
        {
          repo: sc.dids.alice,
          collection: 'com.para.raq.assessment',
          rkey,
          record: {
            $type: 'com.para.raq.assessment',
            answers: [{ questionId: 'q1', value: 3 }],
            results: [
              {
                axisId: 'economy',
                axisTitle: 'Economy',
                score: 90,
                label: 'Planning',
                labelLow: 'Market',
                labelHigh: 'Planning',
                rawScore: 9,
              },
            ],
            compass: { x: -300, y: 200, ninth: 'auth-left' },
            ideology: {
              name: 'Social Democrat',
              description: '.',
              matchPercent: 90,
            },
            isPublic: true,
            completedAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.alice) },
      )
    })

    const row = await db.db
      .selectFrom('raq_assessment')
      .selectAll()
      .where('uri', '=', ref.uri)
      .executeTakeFirst()

    expect(row).toBeDefined()
    expect(row?.ideologyJson).toMatchObject({ name: 'Social Democrat' })
    // createdAt falls back to completedAt (the assessment lexicon has no
    // createdAt of its own) instead of the epoch.
    expect(row?.createdAt).toBe(row?.completedAt)
    expect(row?.createdAt?.startsWith('1970-01-01')).toBe(false)
  })

  it('updates a proposal record in place (upsert by uri)', async () => {
    const ref = await writeParaFixture(network, async () => {
      return createRaqProposalRecord(sc, sc.dids.dan, {
        text: 'Original question?',
        targetCommunity: 'jalisco',
      })
    })
    const rkey = ref.uri.split('/').pop()

    await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.putRecord(
        {
          repo: sc.dids.dan,
          collection: 'com.para.raq.proposal',
          rkey,
          record: {
            $type: 'com.para.raq.proposal',
            text: 'Updated question?',
            targetCommunity: 'jalisco',
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.dan) },
      )
    })

    const row = await db.db
      .selectFrom('raq_proposal')
      .selectAll()
      .where('uri', '=', ref.uri)
      .executeTakeFirst()

    expect(row?.text).toBe('Updated question?')
  })

  it('indexes and updates proposal answers', async () => {
    const proposalRef = await writeParaFixture(network, async () => {
      return createRaqProposalRecord(sc, sc.dids.alice, {
        text: 'Answer me: free healthcare?',
        targetCommunity: 'jalisco',
      })
    })

    const answerRes = await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.createRecord(
        {
          repo: sc.dids.bob,
          collection: 'com.para.raq.proposalAnswer',
          record: {
            $type: 'com.para.raq.proposalAnswer',
            subject: proposalRef.uri,
            value: 2,
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.bob) },
      )
    })
    const rkey = answerRes.data.uri.split('/').pop()

    const row = await db.db
      .selectFrom('raq_proposal_answer')
      .selectAll()
      .where('uri', '=', answerRes.data.uri)
      .executeTakeFirst()
    expect(row?.value).toBe(2)

    await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.putRecord(
        {
          repo: sc.dids.bob,
          collection: 'com.para.raq.proposalAnswer',
          rkey,
          record: {
            $type: 'com.para.raq.proposalAnswer',
            subject: proposalRef.uri,
            value: -3,
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.bob) },
      )
    })

    const updated = await db.db
      .selectFrom('raq_proposal_answer')
      .selectAll()
      .where('uri', '=', answerRes.data.uri)
      .executeTakeFirst()
    expect(updated?.value).toBe(-3)
  })

  it('keeps the original uri when deduplicating votes by nullifier', async () => {
    const voteNullifier = `m8-raq-axis-keep-uri-person-${runId}`
    const bobRef = await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.bob, {
        axisId: 'transit-funding',
        value: 1,
        voteNullifier,
      })
    })
    await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.carol, {
        axisId: 'transit-funding',
        value: -1,
        voteNullifier,
      })
    })

    const rows = await db.db
      .selectFrom('raq_axis_vote')
      .selectAll()
      .where('voteNullifier', '=', voteNullifier)
      .execute()

    expect(rows).toHaveLength(1)
    // The dedup folds carol's vote into bob's row without stealing its uri,
    // so bob's record row never points at a missing vote.
    expect(rows[0].uri).toBe(bobRef.uri)
    expect(rows[0].value).toBe(-1)
  })

  it('hands a shared vote to a surviving record on delete', async () => {
    const voteNullifier = `m8-raq-axis-heir-person-${runId}`
    const bobRef = await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.bob, {
        axisId: 'housing-cost',
        value: 1,
        voteNullifier,
      })
    })
    const carolRef = await writeParaFixture(network, async () => {
      return createRaqAxisVoteRecord(sc, sc.dids.carol, {
        axisId: 'housing-cost',
        value: 1,
        voteNullifier,
      })
    })

    const deleteVote = async (ref: { uri: string }, did: string) => {
      await writeParaFixture(network, async () => {
        return sc.agent.com.atproto.repo.deleteRecord(
          {
            repo: did,
            collection: 'com.para.raq.axisVote',
            rkey: ref.uri.split('/').pop() as string,
          },
          { encoding: 'application/json', headers: sc.getHeaders(did) },
        )
      })
    }

    // Deleting one identity's record must not drop the shared vote.
    await deleteVote(bobRef, sc.dids.bob)
    let rows = await db.db
      .selectFrom('raq_axis_vote')
      .selectAll()
      .where('voteNullifier', '=', voteNullifier)
      .execute()
    expect(rows).toHaveLength(1)
    expect(rows[0].uri).toBe(carolRef.uri)

    // Deleting the last referencing record removes the vote.
    await deleteVote(carolRef, sc.dids.carol)
    rows = await db.db
      .selectFrom('raq_axis_vote')
      .selectAll()
      .where('voteNullifier', '=', voteNullifier)
      .execute()
    expect(rows).toHaveLength(0)
  })

  it('paginates getProposals by cursor', async () => {
    const created: string[] = []
    for (let i = 0; i < 3; i++) {
      const ref = await writeParaFixture(network, async () => {
        return createRaqProposalRecord(sc, sc.dids.dan, {
          text: `Pagination proposal ${i}`,
          targetCommunity: 'yucatan',
        })
      })
      created.push(ref.uri)
    }

    const fetchProposals = async (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(
        `${network.bsky.url}/xrpc/com.para.raq.getProposals?${qs}`,
      )
      expect(res.status).toBe(200)
      return res.json()
    }

    const page1 = await fetchProposals({ community: 'yucatan', limit: '2' })
    expect(page1.proposals).toHaveLength(2)
    expect(typeof page1.cursor).toBe('string')
    expect(page1.cursor.length).toBeGreaterThan(0)

    const page2 = await fetchProposals({
      community: 'yucatan',
      limit: '2',
      cursor: page1.cursor,
    })
    const page1Uris = new Set(page1.proposals.map((p: any) => p.uri))
    const page2Uris = page2.proposals.map((p: any) => p.uri)

    expect(page2.proposals.length).toBeGreaterThan(0)
    for (const uri of page2Uris) {
      expect(page1Uris.has(uri)).toBe(false)
    }
  })

  it('returns numeric vote and answer aggregates in getProposals', async () => {
    const proposalRef = await writeParaFixture(network, async () => {
      return createRaqProposalRecord(sc, sc.dids.alice, {
        text: 'Aggregate me',
        targetCommunity: 'sonora',
      })
    })
    const answerRes = await writeParaFixture(network, async () => {
      return sc.agent.com.atproto.repo.createRecord(
        {
          repo: sc.dids.bob,
          collection: 'com.para.raq.proposalAnswer',
          record: {
            $type: 'com.para.raq.proposalAnswer',
            subject: proposalRef.uri,
            value: 2,
            createdAt: new Date().toISOString(),
          },
        },
        { encoding: 'application/json', headers: sc.getHeaders(sc.dids.bob) },
      )
    })

    const qs = new URLSearchParams({ community: 'sonora' }).toString()
    const res = await (
      await fetch(`${network.bsky.url}/xrpc/com.para.raq.getProposals?${qs}`)
    ).json()
    const proposal = res.proposals.find((p: any) => p.uri === proposalRef.uri)

    expect(proposal).toBeDefined()
    expect(proposal.answerCount).toBe(1)
    expect(proposal.answerAverage).toBe(2)
    // Postgres aggregates come back as strings; they must be numbers here or
    // proto serialization fails.
    expect(typeof proposal.answerCount).toBe('number')
    expect(typeof proposal.answerAverage).toBe('number')
    expect(typeof proposal.upvotes).toBe('number')
  })
})
