import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  usersSeed,
} from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import { finalizeDueCabildeos } from '../src/data-plane/server/indexing/plugins/finalize-cabildeos.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

type Cited = { uri: string; author: string; stance: string; text: string }
type View = {
  uri: string
  text: string
  author: string
  cited: Cited[]
  officialThreadSlug?: string
  reviewDate?: string
  edited: boolean
  createdAt: string
}
type Result = {
  conclusion?: View
  earlier: View[]
  communityUri?: string
}

// A conclusion is served only for a forum or persuasion cabildeo, only when
// written by a current steward of its community, only as first committed, and
// it never closes anything.
maybeDescribe('conclusion (AppView)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // board creator, so a steward
  let dan: DidString // outsider
  let board: string
  let otherBoard: string
  let forum: string
  let persuasion: string
  let activity: string
  let forumPosition: string
  let persuasionPosition: string

  const result = async (cabildeo: string) => {
    const url = new URL('/xrpc/com.para.civic.getConclusion', network.bsky.url)
    url.searchParams.set('cabildeo', cabildeo)
    return (await (await fetch(url)).json()) as Result
  }

  const write = async (
    by: DidString,
    collection: string,
    record: Record<string, unknown>,
  ) => {
    const { data } = await sc.agent.com.atproto.repo.createRecord(
      { repo: by, collection, record: { $type: collection, ...record } },
      { encoding: 'application/json', headers: sc.getHeaders(by) },
    )
    return data.uri
  }
  const rkey = (uri: string) => uri.split('/').pop() as string

  const cabildeo = (kind?: string, phase = 'open') =>
    write(alice, 'com.para.civic.cabildeo', {
      title: 'Qué hacemos con el parque',
      description: 'Una conversación abierta.',
      community: board,
      phase,
      options: [{ label: 'Una' }, { label: 'Otra' }],
      createdAt: new Date().toISOString(),
      ...(kind && { kind }),
    })

  const conclude = (
    by: DidString,
    cabildeoUri: string,
    text: string,
    extra: Record<string, unknown> = {},
  ) =>
    write(by, 'com.para.civic.conclusion', {
      cabildeo: cabildeoUri,
      communityUri: board,
      text,
      createdAt: new Date().toISOString(),
      ...extra,
    })

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'para_conclusion_test',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, dan } = sc.dids)
    board = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Conclusion Board',
        quadrant: 'center',
      })
    ).uri
    otherBoard = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Another Board',
        quadrant: 'center',
      })
    ).uri
    forum = await cabildeo('forum')
    persuasion = await cabildeo('persuasion')
    activity = await cabildeo()
    await network.processAll()
    forumPosition = await write(dan, 'com.para.civic.position', {
      cabildeo: forum,
      stance: 'for',
      text: 'Un parque con sombra.',
      createdAt: new Date().toISOString(),
    })
    persuasionPosition = await write(dan, 'com.para.civic.position', {
      cabildeo: persuasion,
      stance: 'against',
      text: 'Otra cosa.',
      createdAt: new Date().toISOString(),
    })
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('tells a client the kind of a cabildeo, defaulting to activity', async () => {
    const kindOf = async (uri: string) => {
      const url = new URL('/xrpc/com.para.civic.getCabildeo', network.bsky.url)
      url.searchParams.set('cabildeo', uri)
      const body = (await (await fetch(url)).json()) as {
        cabildeo: { kind?: string }
      }
      return body.cabildeo.kind
    }
    expect(await kindOf(forum)).toBe('forum')
    expect(await kindOf(persuasion)).toBe('persuasion')
    expect(await kindOf(activity)).toBe('activity')
  })

  it('serves outcomes only for the current official pin after a finalized tally', async () => {
    const now = new Date().toISOString()
    const poll = await write(alice, 'com.para.civic.cabildeo', {
      title: 'Park cleanup',
      description: 'Pick a day.',
      community: board,
      kind: 'activity',
      phase: 'voting',
      phaseDeadline: new Date(Date.now() - 1000).toISOString(),
      minimumViewTier: 'public',
      options: [{ label: 'Saturday' }, { label: 'Sunday' }],
      createdAt: now,
    })
    const threadUri = await write(alice, 'app.bsky.feed.post', {
      text: 'Plan the park cleanup',
      createdAt: now,
    })
    const pin = {
      communityUri: board,
      slug: 'cleanup',
      kind: 'megathread',
      title: 'Park cleanup',
      body: '',
      threadUri,
      pollUri: poll,
      pinned: true,
      createdBy: alice,
      createdAt: now,
      updatedAt: now,
    }
    const pinUri = await write(alice, 'com.para.community.wikiPage', pin)
    await network.processAll()
    await finalizeDueCabildeos(network.bsky.db.db)
    const db = network.bsky.db.db
    expect(
      await db
        .selectFrom('cabildeo_cabildeo')
        .select(['kind', 'phase'])
        .where('uri', '=', poll)
        .executeTakeFirst(),
    ).toEqual({ kind: 'activity', phase: 'resolved' })
    const source = await db
      .selectFrom('record')
      .select('json')
      .where('uri', '=', poll)
      .executeTakeFirstOrThrow()
    expect(JSON.parse(source.json)).toMatchObject({ minimumViewTier: 'public' })
    const indexedPin = await db
      .selectFrom('para_community_wiki_page')
      .select('json')
      .where('uri', '=', pinUri)
      .executeTakeFirstOrThrow()
    expect(JSON.parse(indexedPin.json)).toMatchObject({ pollUri: poll })
    expect((await result(poll)).communityUri).toBe(board)

    await conclude(dan, poll, 'Outsider', { officialThreadSlug: 'cleanup' })
    await conclude(alice, poll, 'Wrong thread', {
      officialThreadSlug: 'unrelated',
    })
    const original = await conclude(alice, poll, 'Publish the next steps.', {
      officialThreadSlug: 'cleanup',
      reviewDate: '2027-01-15',
    })
    await network.processAll()
    expect((await result(poll)).conclusion).toMatchObject({
      uri: original,
      reviewDate: '2027-01-15',
    })

    const correction = await conclude(
      alice,
      poll,
      'Recheck the permit first.',
      {
        officialThreadSlug: 'cleanup',
        createdAt: new Date(Date.now() + 1000).toISOString(),
      },
    )
    await network.processAll()
    const revised = await result(poll)
    expect(revised.conclusion?.uri).toBe(correction)
    expect(revised.earlier.map((item) => item.uri)).toEqual([original])

    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.community.wikiPage',
        rkey: rkey(pinUri),
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    expect((await result(poll)).conclusion).toBeUndefined()
  })

  it('serves a steward conclusion with the positions it cites', async () => {
    const uri = await conclude(alice, forum, 'Hay acuerdo en la sombra.', {
      // The second belongs to another cabildeo, so it is dropped.
      cited: [forumPosition, persuasionPosition],
    })
    await network.processAll()

    const { conclusion, earlier } = await result(forum)
    expect(conclusion?.uri).toBe(uri)
    expect(conclusion?.text).toBe('Hay acuerdo en la sombra.')
    expect(conclusion?.cited.map((p) => p.uri)).toEqual([forumPosition])
    expect(conclusion?.cited[0].text).toBe('Un parque con sombra.')
    expect(earlier).toEqual([])
  })

  it('ignores an outsider, a wrong board and a record that is not valid', async () => {
    const own = await cabildeo('forum')
    await network.processAll()
    await conclude(dan, own, 'Yo concluyo.')
    await write(alice, 'com.para.civic.conclusion', {
      cabildeo: own,
      communityUri: otherBoard,
      text: 'De otra comunidad.',
      createdAt: new Date().toISOString(),
    })
    await conclude(alice, own, 'Cita mal.', {
      cited: ['at://did:plc:x/app.bsky.feed.post/1'],
    })
    await network.processAll()

    // Nothing is served, but a steward's client is told which board to name.
    expect(await result(own)).toEqual({ earlier: [], communityUri: board })
  })

  it('never concludes an activity, which ends in a vote', async () => {
    await conclude(alice, activity, 'No aplica.')
    await network.processAll()
    expect(await result(activity)).toEqual({ earlier: [] })
  })

  it('does not serve a draft', async () => {
    const draft = await cabildeo('forum', 'draft')
    await network.processAll()
    await conclude(alice, draft, 'Aún no.')
    await network.processAll()
    expect(await result(draft)).toEqual({ earlier: [] })
  })

  it('shows the newest and keeps the earlier ones as history', async () => {
    const own = await cabildeo('persuasion')
    await network.processAll()
    const first = await conclude(alice, own, 'Primera lectura.')
    await network.processAll()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await conclude(alice, own, 'Lectura corregida.')
    await network.processAll()

    const { conclusion, earlier } = await result(own)
    expect(conclusion?.uri).toBe(second)
    expect(earlier.map((c) => c.uri)).toEqual([first])
  })

  it('serves the first version of an edited conclusion, flagged', async () => {
    const own = await cabildeo('forum')
    await network.processAll()
    const uri = await conclude(alice, own, 'Texto original.')
    await network.processAll()
    const before = (await result(own)).conclusion

    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: alice,
        collection: 'com.para.civic.conclusion',
        rkey: rkey(uri),
        record: {
          $type: 'com.para.civic.conclusion',
          cabildeo: own,
          communityUri: board,
          text: 'Texto reescrito.',
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()

    const after = (await result(own)).conclusion
    expect(after?.text).toBe('Texto original.')
    expect(after?.edited).toBe(true)
    // The date is committed too, so an edit cannot make it look newer.
    expect(after?.createdAt).toBe(before?.createdAt)
  })

  it('lets a steward retract a conclusion by deleting it', async () => {
    const own = await cabildeo('forum')
    await network.processAll()
    const uri = await conclude(alice, own, 'Se retira.')
    await network.processAll()
    expect((await result(own)).conclusion?.uri).toBe(uri)

    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: alice,
        collection: 'com.para.civic.conclusion',
        rkey: rkey(uri),
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    expect(await result(own)).toEqual({ earlier: [], communityUri: board })
  })
})
