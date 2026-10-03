import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  usersSeed,
} from '@atproto/dev-env'
import { communityActivitySchemas } from '../src/api/com/para/community/activities/schemas.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

const DAY = 24 * 60 * 60 * 1000
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()

type ActivityView = {
  uri: string
  author: string
  category: string
  communityUri: string
  communityName?: string
  record: { title: string }
}

// Activities, ledgers and wiki pages are served only when written by one of
// the community's current organizers: the board's creator, or an owner or
// moderator by verified authority events. Self-declared roles do not count.
maybeDescribe('community activities (AppView)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: string // board creator and owner
  let bob: string // moderator appointed by alice
  let carol: string // member who declares herself a moderator
  let dan: string // outsider
  let board: string
  let bobMembership: string
  let bobModerator: string

  const xrpc = async <T>(nsid: string, params: Record<string, string>) => {
    const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    const res = await fetch(url)
    return { status: res.status, body: (await res.json()) as T }
  }
  const listActivities = async (params: Record<string, string>) =>
    (
      await xrpc<{ activities: ActivityView[]; cursor?: string }>(
        'com.para.community.listActivities',
        params,
      )
    ).body
  const titles = (activities: ActivityView[]) =>
    activities.map((a) => a.record.title).sort()

  const write = async (
    by: string,
    collection: string,
    record: Record<string, unknown>,
  ) => {
    const { data } = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: by,
        collection,
        record: { $type: collection, ...record },
      },
      { encoding: 'application/json', headers: sc.getHeaders(by) },
    )
    return data.uri
  }

  const authorityEvent = (
    issuer: string,
    event: {
      subject: string
      action: string
      basis: string
      version: number
      predecessor?: string
      evidence?: string
    },
  ) =>
    write(issuer, 'com.para.community.authorityEvent', {
      community: board,
      issuer,
      effectiveAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      ...event,
    })

  const socialActivity = (
    by: string,
    title: string,
    opts: { community?: string; startsAt?: string; status?: string } = {},
  ) =>
    write(by, 'com.para.community.socialActivity', {
      communityUri: opts.community ?? board,
      title,
      startsAt: opts.startsAt ?? inDays(7),
      status: opts.status ?? 'planned',
      details: {
        $type: 'com.para.community.socialActivity#peacefulMarch',
        meetingPoint: 'Zócalo',
        permitStatus: 'notRequired',
      },
      createdBy: by,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

  const raffle = (by: string, title: string, opts: { startsAt?: string; status?: string } = {}) =>
    write(by, 'com.para.community.economicActivity', {
      communityUri: board,
      title,
      startsAt: opts.startsAt ?? inDays(-10),
      status: opts.status ?? 'completed',
      details: {
        $type: 'com.para.community.economicActivity#raffle',
        ticketPriceMinor: 5000,
        ticketsAvailable: 100,
        prizes: [{ description: 'Bicicleta' }],
        drawAt: inDays(-9),
        drawMethod: 'publicDraw',
      },
      financialPlan: {
        currency: 'MXN',
        allocationBase: 'netProceeds',
        allocations: [
          { recipient: 'community', label: 'Fondo común', shareBps: 10000 },
        ],
        committedAt: inDays(-20),
      },
      createdBy: by,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

  const ledgerEntry = (
    by: string,
    activityUri: string,
    description: string,
    community = board,
  ) =>
    write(by, 'com.para.community.activityLedgerEntry', {
      activityUri,
      communityUri: community,
      termsDigest: 'a'.repeat(64),
      entryType: 'income',
      amountMinor: 5000,
      currency: 'MXN',
      description,
      occurredAt: inDays(-9),
      createdAt: new Date().toISOString(),
    })

  const wikiPage = (
    by: string,
    slug: string,
    title: string,
    opts: { kind?: string; pinned?: boolean; updatedAt?: string } = {},
  ) =>
    write(by, 'com.para.community.wikiPage', {
      communityUri: board,
      kind: opts.kind ?? 'page',
      slug,
      title,
      body: `# ${title}`,
      pinned: opts.pinned ?? false,
      createdBy: by,
      createdAt: new Date().toISOString(),
      updatedAt: opts.updatedAt ?? new Date().toISOString(),
    })

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'para_community_activities_test',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)

    board = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Activities Board',
        quadrant: 'center',
      })
    ).uri
    await network.processAll()

    // alice founds the board and owns it; she appoints bob as moderator.
    const aliceMember = await authorityEvent(alice, {
      subject: alice,
      action: 'member.activate',
      basis: 'foundingTransition',
      version: 1,
    })
    await network.processAll()
    await authorityEvent(alice, {
      subject: alice,
      action: 'owner.grant',
      basis: 'foundingTransition',
      version: 2,
      predecessor: aliceMember,
    })
    bobMembership = await authorityEvent(bob, {
      subject: bob,
      action: 'member.activate',
      basis: 'openAdmission',
      version: 1,
    })
    await network.processAll()
    bobModerator = await authorityEvent(alice, {
      subject: bob,
      action: 'moderator.grant',
      basis: 'ownerAppointment',
      version: 2,
      predecessor: bobMembership,
      evidence: `at://${alice}/com.para.community.decision/appoint-bob`,
    })
    // carol claims a moderator role in her own membership record.
    await sc.agent.com.atproto.repo.createRecord(
      {
        repo: carol,
        collection: 'com.para.community.membership',
        record: {
          $type: 'com.para.community.membership',
          community: board,
          membershipState: 'active',
          roles: ['moderator'],
          joinedAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(carol) },
    )
    await createCommunityMembershipRecord(sc, dan, board, 'active')
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('keeps the hand-registered schemas in sync with the lexicon files', () => {
    const dir = join(__dirname, '../../../lexicons/com/para/community')
    for (const schema of communityActivitySchemas) {
      const name = String(schema.id).split('.').pop()
      const file = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'))
      expect(schema).toEqual(file)
    }
  })

  it('lists only activities by the community organizers', async () => {
    await socialActivity(alice, 'Marcha por el agua')
    await socialActivity(carol, 'Marcha de carol')
    await socialActivity(dan, 'Marcha de dan')
    await raffle(bob, 'Rifa de bob')
    await network.processAll()

    const { activities } = await listActivities({ community: board })
    expect(titles(activities)).toEqual(['Marcha por el agua', 'Rifa de bob'])
    expect(activities[0].communityName).toBe('Activities Board')
  })

  it('filters by time and category', async () => {
    const upcoming = await listActivities({ community: board, time: 'upcoming' })
    expect(titles(upcoming.activities)).toEqual(['Marcha por el agua'])
    const past = await listActivities({ community: board, time: 'past' })
    expect(titles(past.activities)).toEqual(['Rifa de bob'])
    const economic = await listActivities({
      community: board,
      category: 'economic',
    })
    expect(economic.activities.map((a) => a.category)).toEqual(['economic'])
  })

  it('pages with a cursor, skipping records it must not serve', async () => {
    const first = await listActivities({ community: board, limit: '1' })
    expect(first.activities).toHaveLength(1)
    expect(first.cursor).toBeTruthy()
    const second = await listActivities({
      community: board,
      limit: '1',
      cursor: first.cursor!,
    })
    expect(second.activities).toHaveLength(1)
    expect(second.activities[0].uri).not.toBe(first.activities[0].uri)
  })

  it('ignores activities naming a community that does not exist', async () => {
    const missing = board.replace(/[^/]+$/, 'missing-board')
    await socialActivity(alice, 'Huérfana', { community: missing })
    await network.processAll()
    const all = await listActivities({})
    expect(titles(all.activities)).not.toContain('Huérfana')
  })

  it('serves the ledger an organizer recorded for the activity', async () => {
    const { activities } = await listActivities({
      community: board,
      category: 'economic',
    })
    const raffleUri = activities[0].uri
    await ledgerEntry(bob, raffleUri, 'Boletos vendidos por bob')
    await ledgerEntry(alice, raffleUri, 'Boletos vendidos por alice')
    await ledgerEntry(carol, raffleUri, 'Boletos de carol')
    await ledgerEntry(
      bob,
      raffleUri,
      'Otra comunidad',
      board.replace(/[^/]+$/, 'elsewhere'),
    )
    await network.processAll()

    const { status, body } = await xrpc<{
      activity: ActivityView
      ledger: Array<{ author: string; record: { description: string } }>
    }>('com.para.community.getActivity', { uri: raffleUri })
    expect(status).toBe(200)
    expect(body.activity.record.title).toBe('Rifa de bob')
    expect(body.ledger.map((e) => e.record.description).sort()).toEqual([
      'Boletos vendidos por alice',
      'Boletos vendidos por bob',
    ])
  })

  it('does not serve a non-organizer activity by uri', async () => {
    const all = await xrpc<{ activities: ActivityView[] }>(
      'com.para.community.listActivities',
      { community: board },
    )
    expect(all.body.activities.some((a) => a.author === carol)).toBe(false)
    const carolUri = await socialActivity(carol, 'Otra de carol')
    await network.processAll()
    const res = await xrpc<{ error: string }>('com.para.community.getActivity', {
      uri: carolUri,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('NotFound')
  })

  it('reflects edits and deletes', async () => {
    const uri = await socialActivity(alice, 'Asamblea borrador')
    await network.processAll()
    const rkey = uri.split('/').pop()!
    const { data: current } = await sc.agent.com.atproto.repo.getRecord({
      repo: alice,
      collection: 'com.para.community.socialActivity',
      rkey,
    })
    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: alice,
        collection: 'com.para.community.socialActivity',
        rkey,
        record: { ...(current.value as object), title: 'Asamblea final' },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    let list = await listActivities({ community: board })
    expect(titles(list.activities)).toContain('Asamblea final')
    expect(titles(list.activities)).not.toContain('Asamblea borrador')

    await sc.agent.com.atproto.repo.deleteRecord(
      { repo: alice, collection: 'com.para.community.socialActivity', rkey },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await network.processAll()
    list = await listActivities({ community: board })
    expect(titles(list.activities)).not.toContain('Asamblea final')
  })

  it('lists organizer wiki pages, latest per slug, pinned first', async () => {
    await wikiPage(alice, 'about', 'Acerca de (viejo)', {
      updatedAt: inDays(-2),
    })
    await wikiPage(bob, 'about', 'Acerca de', { updatedAt: inDays(-1) })
    await wikiPage(carol, 'rules', 'Reglas de carol')
    await wikiPage(alice, 'agua', 'Megahilo del agua', {
      kind: 'megathread',
      pinned: true,
    })
    await network.processAll()

    const { body } = await xrpc<{
      pages: Array<{ author: string; record: { title: string } }>
    }>('com.para.community.listWikiPages', { community: board })
    expect(body.pages.map((p) => p.record.title)).toEqual([
      'Megahilo del agua',
      'Acerca de',
    ])
    const megathreads = await xrpc<{ pages: unknown[] }>(
      'com.para.community.listWikiPages',
      { community: board, kind: 'megathread' },
    )
    expect(megathreads.body.pages).toHaveLength(1)
  })

  it('stops serving a moderator’s records once the role is revoked', async () => {
    await authorityEvent(alice, {
      subject: bob,
      action: 'moderator.revoke',
      basis: 'ownerAppointment',
      version: 3,
      predecessor: bobModerator,
      evidence: `at://${alice}/com.para.community.decision/revoke-bob`,
    })
    await network.processAll()
    const { activities } = await listActivities({ community: board })
    expect(activities.some((a) => a.author === bob)).toBe(false)
    const { body } = await xrpc<{
      pages: Array<{ author: string; record: { title: string } }>
    }>('com.para.community.listWikiPages', { community: board })
    // alice's older page for the slug takes over.
    expect(body.pages.map((p) => p.record.title)).toContain(
      'Acerca de (viejo)',
    )
  })
})
