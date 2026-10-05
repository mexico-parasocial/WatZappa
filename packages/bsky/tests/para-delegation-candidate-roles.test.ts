import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCabildeoRecord,
  createCommunityBoardRecord,
  usersSeed,
} from '@atproto/dev-env'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

type Candidate = { did: string; roles: string[] }

// A member may nominate themselves as a delegate candidate in their own
// membership record, but cannot declare an office there. Offices come from
// verified authority events or the trusted governance record, and membership
// from getAuthoritySnapshot.
maybeDescribe('delegation candidate roles (AppView)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: string // board creator and owner; official by her governance record
  let bob: string // moderator appointed by alice
  let carol: string // member who declares offices in her membership record
  let dan: string // member who nominates himself as a delegate
  let erin: string // self-nominated, then removed by authority events
  let board: string
  let cabildeo: string

  const write = async (
    by: string,
    collection: string,
    record: Record<string, unknown>,
    rkey?: string,
  ) => {
    const input = {
      repo: by,
      collection,
      record: { $type: collection, ...record },
    }
    const opts = { encoding: 'application/json', headers: sc.getHeaders(by) }
    const { data } = rkey
      ? await sc.agent.com.atproto.repo.putRecord({ ...input, rkey }, opts)
      : await sc.agent.com.atproto.repo.createRecord(input, opts)
    return data
  }

  const authorityEvent = async (
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
    (
      await write(issuer, 'com.para.community.authorityEvent', {
        community: board,
        issuer,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
        ...event,
      })
    ).uri

  const membership = (by: string, roles: string[]) =>
    write(by, 'com.para.community.membership', {
      community: board,
      membershipState: 'active',
      roles,
      joinedAt: new Date().toISOString(),
    })

  const governanceRecord = (
    by: string,
    rkey: string,
    officials: Array<{ did: string; office: string }>,
    moderators: string[] = [],
  ) => {
    const now = new Date().toISOString()
    return write(
      by,
      'com.para.community.governance',
      {
        community: 'Delegates Board',
        slug: rkey,
        createdAt: now,
        updatedAt: now,
        moderators: moderators.map((did) => ({
          did,
          role: 'Moderador',
          badge: 'mod',
          capabilities: [],
        })),
        officials: officials.map((official) => ({
          ...official,
          mandate: 'Indefinido',
        })),
        deputies: [],
      },
      rkey,
    )
  }

  const listCandidates = async (viewer: string) => {
    const nsid = 'com.para.civic.listDelegationCandidates'
    const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
    url.searchParams.set('cabildeo', cabildeo)
    url.searchParams.set('communityId', board)
    const res = await fetch(url, {
      headers: await network.serviceHeaders(viewer, nsid),
    })
    return {
      status: res.status,
      body: (await res.json()) as { candidates?: Candidate[]; error?: string },
    }
  }

  // carol is an active member by her legacy record, which both the old and
  // the current membership checks accept.
  const rolesByDid = async (viewer = carol) => {
    const { status, body } = await listCandidates(viewer)
    expect({ status, body }).toMatchObject({ status: 200 })
    return Object.fromEntries(
      (body.candidates ?? []).map((c) => [c.did, [...c.roles].sort()]),
    )
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_delegate_roles_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)
    erin = (
      await sc.createAccount('erin', {
        handle: 'erin.test',
        email: 'erin@test.com',
        password: 'erin-pass',
      })
    ).did

    board = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Delegates Board',
        quadrant: 'center',
      })
    ).uri
    await network.processAll()
    const { slug } = await network.bsky.db.db
      .selectFrom('para_community_board')
      .where('uri', '=', board)
      .select('slug')
      .executeTakeFirstOrThrow()

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
    const bobMember = await authorityEvent(bob, {
      subject: bob,
      action: 'member.activate',
      basis: 'openAdmission',
      version: 1,
    })
    await network.processAll()
    await authorityEvent(alice, {
      subject: bob,
      action: 'moderator.grant',
      basis: 'ownerAppointment',
      version: 2,
      predecessor: bobMember,
      evidence: `at://${alice}/com.para.community.decision/appoint-bob`,
    })
    await membership(bob, [])

    await membership(carol, [
      'moderator',
      'official',
      'deputy',
      'representante',
    ])
    await membership(dan, ['delegado', 'official'])
    const erinMembership = await membership(erin, ['delegate'])

    await governanceRecord(alice, slug as string, [
      { did: alice, office: 'Presidencia' },
    ])
    await network.processAll()
    // carol publishes a newer record under the same slug naming herself.
    await governanceRecord(
      carol,
      slug as string,
      [{ did: carol, office: 'Presidencia' }],
      [carol],
    )

    cabildeo = (
      await createCabildeoRecord(sc, alice, {
        title: 'Delegates',
        description: 'Who may receive delegated votes.',
        community: slug as string,
        phase: 'voting',
        options: [{ label: 'A' }, { label: 'B' }],
      })
    ).uri
    await network.processAll()

    // erin's own record still says active, but an assembly removed her.
    const removal = (action: string, version: number) => ({
      id: `test:${erin}:${action}`,
      uri: `at://${erin}/com.para.community.authorityEvent/${action}`,
      cid: erinMembership.cid,
      creator: erin,
      communityUri: board,
      subject: erin,
      action,
      issuer: erin,
      effectiveAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: null,
      predecessor: null,
      version,
      basis: 'assemblyDecision',
      evidence: null,
      createdAt: new Date().toISOString(),
      indexedAt: new Date().toISOString(),
    })
    await network.bsky.db.db
      .insertInto('para_community_authority_event')
      .values([removal('member.activate', 1), removal('member.remove', 2)])
      .execute()
  })

  afterAll(async () => {
    await network.close()
  })

  it('reports offices only from authority events and the trusted record', async () => {
    expect(await rolesByDid()).toEqual({
      [alice]: ['Presidencia'],
      [bob]: ['moderator'],
      [dan]: ['delegate'],
    })
  })

  it('does not list a member for offices declared in her own record', async () => {
    const candidates = await rolesByDid()
    expect(candidates[carol]).toBeUndefined()
  })

  it('reports a self-nomination as delegate, never as an office', async () => {
    const candidates = await rolesByDid()
    expect(candidates[dan]).toEqual(['delegate'])
  })

  it('drops a self-nominee removed by authority events', async () => {
    const candidates = await rolesByDid()
    expect(candidates[erin]).toBeUndefined()
  })

  it('admits viewers by authority events, not by their own record', async () => {
    const { status, body } = await listCandidates(erin)
    expect(status).toBe(400)
    expect(body.error).toBe('CommunityMembershipRequired')
    // alice is a member by authority events alone, with no membership record.
    expect((await listCandidates(alice)).status).toBe(200)
  })
})
