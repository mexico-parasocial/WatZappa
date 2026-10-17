import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  usersSeed,
} from '@atproto/dev-env'
import {
  getGovernanceAuthors,
  isCommunityOwnerSql,
} from '../src/data-plane/server/community-governance.js'
import { up as dropSelfDeclaredRoles } from '../src/data-plane/server/db/migrations/20261004T120000000Z-drop-self-declared-community-roles.js'
import { up as reindexGovernance } from '../src/data-plane/server/db/migrations/20261005T120000000Z-reindex-para-community-governance.js'
import { up as revalidateAuthority } from '../src/data-plane/server/db/migrations/20261005T130000000Z-revalidate-community-authority.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

type Governance = {
  moderators: Array<{ did: string; role: string }>
  officials: Array<{ did: string; office: string }>
}

// Two sources of community roles that any account can write must grant
// nothing: the roles in a member's own membership record, and a governance
// record published from a repo that is neither the board creator's nor a
// verified owner's.
maybeDescribe('community role forgery (AppView)', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: string // board creator and owner
  let bob: string // moderator appointed by alice
  let carol: string // member who declares herself owner and moderator
  let dan: string // outsider
  let board: string
  let boardName: string
  let aliceOwner: string
  let bobModerator: string

  const xrpc = async <T>(
    nsid: string,
    params: Record<string, string>,
    viewer?: string,
  ) => {
    const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    const res = await fetch(url, {
      headers: viewer ? await network.serviceHeaders(viewer, nsid) : {},
    })
    return { status: res.status, body: (await res.json()) as T }
  }

  // The viewer's effective roles, as getBoard reports them.
  const rolesOf = async (viewer: string, community = board) => {
    const { status, body } = await xrpc<{
      board: { viewerRoles?: string[] }
    }>('com.para.community.getBoard', { uri: community }, viewer)
    expect({ status, body }).toMatchObject({ status: 200 })
    return (body.board.viewerRoles ?? []).sort()
  }

  const getGovernance = async (community: string) =>
    (
      await xrpc<Governance>('com.para.community.getGovernance', {
        community,
      })
    ).body

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
    community = board,
  ) =>
    write(issuer, 'com.para.community.authorityEvent', {
      community,
      issuer,
      effectiveAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      ...event,
    })

  const selfDeclaredMembership = (by: string, community: string) =>
    write(by, 'com.para.community.membership', {
      community,
      membershipState: 'active',
      roles: ['owner', 'moderator'],
      roleAssignments: [
        { role: 'owner', validFrom: new Date(Date.now() - 1000).toISOString() },
      ],
      joinedAt: new Date().toISOString(),
    })

  const governanceRecord = (
    by: string,
    rkey: string,
    community: string,
    moderators: string[],
    metadata?: Record<string, unknown>,
  ) => {
    const now = new Date().toISOString()
    return write(
      by,
      'com.para.community.governance',
      {
        community,
        slug: rkey,
        createdAt: now,
        updatedAt: now,
        moderators: moderators.map((did) => ({
          did,
          role: 'Moderador',
          badge: 'mod',
          capabilities: [],
        })),
        officials: moderators.map((did) => ({
          did,
          office: 'Presidencia',
          mandate: 'Indefinido',
        })),
        deputies: [],
        ...(metadata ? { metadata } : {}),
      },
      rkey,
    )
  }

  const boardSlug = async (uri: string) => {
    const row = await network.bsky.db.db
      .selectFrom('para_community_board')
      .where('uri', '=', uri)
      .select('slug')
      .executeTakeFirstOrThrow()
    return row.slug as string
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_role_forgery_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
      bsky: {
        paraAuthorityServiceToken: 'test-authority-service-token-32-characters',
      },
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)

    boardName = 'Forgery Board'
    board = (
      await createCommunityBoardRecord(sc, alice, {
        name: boardName,
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
    aliceOwner = await authorityEvent(alice, {
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
    bobModerator = await authorityEvent(alice, {
      subject: bob,
      action: 'moderator.grant',
      basis: 'ownerAppointment',
      version: 2,
      predecessor: bobMember,
      evidence: `at://${alice}/com.para.community.decision/appoint-bob`,
    })
    await createCommunityMembershipRecord(sc, bob, board, 'active')
    // carol declares herself owner and moderator in her own membership record.
    await selfDeclaredMembership(carol, board)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  describe('legacy membership roles', () => {
    it('grant a self-declared member nothing above member', async () => {
      expect(await rolesOf(carol)).toEqual(['member'])
      expect(await rolesOf(bob)).toEqual(['member', 'moderator'])
      expect(await rolesOf(alice)).toEqual(['member', 'owner'])
    })

    it('do not make a self-declared member a steward of shared content', async () => {
      const params = { communityUri: board, includeRemoved: 'true' }
      const nsid = 'com.para.community.listSharedContent'
      const forged = await xrpc<{ error: string }>(nsid, params, carol)
      expect(forged.status).not.toBe(200)
      expect(forged.body.error).not.toBeUndefined()
      const verified = await xrpc<{ items: unknown[] }>(nsid, params, bob)
      expect(verified.status).toBe(200)
    })

    it('are not listed as roles of the member', async () => {
      const { status, body } = await xrpc<{
        members: Array<{ did: string; roles?: string[] }>
      }>('com.para.community.listMembers', { communityId: board }, alice)
      expect({ status, body }).toMatchObject({ status: 200 })
      const carolView = body.members.find((member) => member.did === carol)
      expect(carolView?.roles).toEqual(['member'])
      const moderators = await xrpc<{ members: Array<{ did: string }> }>(
        'com.para.community.listMembers',
        { communityId: board, role: 'moderator' },
        alice,
      )
      expect(moderators.body.members.map((member) => member.did)).toEqual([bob])
    })

    it('do not let a self-declared owner appoint a moderator', async () => {
      const danMember = await authorityEvent(dan, {
        subject: dan,
        action: 'member.activate',
        basis: 'openAdmission',
        version: 1,
      })
      await network.processAll()
      await authorityEvent(carol, {
        subject: dan,
        action: 'moderator.grant',
        basis: 'ownerAppointment',
        version: 2,
        predecessor: danMember,
        evidence: `at://${carol}/com.para.community.decision/appoint-dan`,
      })
      await network.processAll()
      expect(await rolesOf(dan)).toEqual(['member'])
    })
  })

  describe('governance record', () => {
    it("shows the creator's record, not a newer one from another repo", async () => {
      const slug = await boardSlug(board)
      await governanceRecord(alice, 'forgery-board', boardName, [bob])
      await network.processAll()
      // dan publishes later, under the board's exact slug and name.
      await governanceRecord(dan, slug, boardName, [dan, carol])
      await network.processAll()

      const governance = await getGovernance(slug)
      expect(governance.moderators.map((m) => m.did)).toEqual([bob])
      expect(governance.officials.map((o) => o.did)).toEqual([bob])

      const { body } = await xrpc<{
        board: { governanceSummary?: { moderatorCount: number } }
      }>('com.para.community.getBoard', { uri: board }, alice)
      expect(body.board.governanceSummary?.moderatorCount).toBe(1)
    })

    it('shows nothing when only other repos published one', async () => {
      const other = (
        await createCommunityBoardRecord(sc, alice, {
          name: 'Unpublished Board',
          quadrant: 'sur',
        })
      ).uri
      await network.processAll()
      const slug = await boardSlug(other)
      await governanceRecord(dan, slug, 'Unpublished Board', [dan])
      await governanceRecord(carol, 'unpublished-board', 'Unpublished Board', [
        carol,
      ])
      await network.processAll()

      const governance = await getGovernance(slug)
      expect(governance.moderators).toEqual([])
      expect(governance.officials).toEqual([])
    })

    it('accepts the record of an owner by verified authority events', async () => {
      const slug = await boardSlug(board)
      await governanceRecord(bob, slug, boardName, [carol])
      await network.processAll()
      // bob is a moderator, not an owner: his record does not count.
      expect((await getGovernance(slug)).moderators.map((m) => m.did)).toEqual([
        bob,
      ])

      // alice transfers ownership to bob.
      await authorityEvent(alice, {
        subject: bob,
        action: 'owner.grant',
        basis: 'ownerTransfer',
        version: 3,
        predecessor: bobModerator,
        evidence: `at://${alice}/com.para.community.decision/transfer-bob`,
      })
      await network.processAll()
      expect(await rolesOf(bob)).toEqual(['member', 'moderator', 'owner'])
      expect((await getGovernance(slug)).moderators.map((m) => m.did)).toEqual([
        carol,
      ])
    })

    it('finds the same owners in SQL as deriveEffectiveAuthority', async () => {
      const db = network.bsky.db
      const ownersBySql = async () => {
        const owners: string[] = []
        for (const did of [alice, bob, carol, dan]) {
          const { rows } = await sql<{
            owner: boolean
          }>`select ${isCommunityOwnerSql(sql`${board}`, sql`${did}`)} as owner`.execute(
            db.db,
          )
          if (rows[0].owner) owners.push(did)
        }
        return owners.sort()
      }
      // A creator who never appears in the events, so only owners remain.
      const ownersByEvents = async () =>
        (
          await getGovernanceAuthors(db, {
            uri: board,
            creator: 'did:example:nobody',
          })
        )
          .filter((did) => did !== 'did:example:nobody')
          .sort()

      expect(await ownersBySql()).toEqual([alice, bob].sort())
      expect(await ownersByEvents()).toEqual([alice, bob].sort())

      // bob, now an owner, revokes alice's ownership.
      await authorityEvent(bob, {
        subject: alice,
        action: 'owner.revoke',
        basis: 'ownerTransfer',
        version: 3,
        predecessor: aliceOwner,
        evidence: `at://${bob}/com.para.community.decision/revoke-alice`,
      })
      await network.processAll()
      expect(await ownersBySql()).toEqual([bob])
      expect(await ownersByEvents()).toEqual([bob])
    })
  })

  describe('authority event forgery', () => {
    it('cannot self-grant ownership using expiry', async () => {
      await authorityEvent(carol, {
        subject: carol,
        action: 'owner.grant',
        basis: 'expiry',
        version: 1,
      })
      await network.processAll()
      expect(await rolesOf(carol)).toEqual(['member'])
    })
    it('cannot regain ownership by repeating the founding transition after handover', async () => {
      const latest = await network.bsky.db.db
        .selectFrom('para_community_authority_event')
        .where('communityUri', '=', board)
        .where('subject', '=', alice)
        .orderBy('version', 'desc')
        .select(['uri', 'version'])
        .executeTakeFirstOrThrow()
      await authorityEvent(alice, {
        subject: alice,
        action: 'owner.grant',
        basis: 'foundingTransition',
        version: latest.version + 1,
        predecessor: latest.uri,
      })
      await network.processAll()
      expect(await rolesOf(alice)).toEqual(['member'])
    })
    it('cannot manufacture assembly authority with a self-published verifiedAt field', async () => {
      const evidence = await write(carol, 'com.para.community.decision', {
        community: board,
        proposal: `at://${carol}/com.para.community.proposal/forged`,
        proposalCid:
          'bafyreihvr7gszsux4yimekpc23kr5wnqbwplx6knods6fxftti57dxzcim',
        result: 'approved',
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        verifiedAt: new Date().toISOString(),
        protectedAction: { action: 'owner.recover', subject: carol },
      })
      await network.processAll()
      await authorityEvent(carol, {
        subject: carol,
        action: 'owner.grant',
        basis: 'assemblyDecision',
        version: 1,
        evidence,
      })
      await network.processAll()
      expect(await rolesOf(carol)).toEqual(['member'])
    })
  })

  describe('authority service reads', () => {
    const nsid = 'com.para.community.getAuthorization'
    const serviceRead = async (subject: string, credential: string) => {
      const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
      url.searchParams.set('community', board)
      url.searchParams.set('action', 'content.create')
      url.searchParams.set('subject', subject)
      const res = await fetch(url, {
        headers: { 'x-para-authority-service-token': credential },
      })
      return {
        status: res.status,
        headers: res.headers,
        body: (await res.json()) as {
          roles?: string[]
          authorization?: { policy: string }
        },
      }
    }
    it('reports verified member roles to the scoped service', async () => {
      const result = await serviceRead(
        bob,
        'test-authority-service-token-32-characters',
      )
      expect(result.status).toBe(200)
      expect(result.body.authorization?.policy).toBe(
        'verified_authority_service',
      )
      expect(result.body.roles).toEqual(['member', 'moderator', 'owner'])
      expect(result.headers.get('cache-control')).toBe('no-store')
    })
    it('rejects an incorrect service credential', async () => {
      expect((await serviceRead(alice, 'wrong-service-token')).status).toBe(401)
    })
    it('does not let an ordinary user read another member authority', async () => {
      const result = await xrpc<{ roles: string[] }>(
        nsid,
        { community: board, action: 'content.create', subject: alice },
        carol,
      )
      expect(result.status).toBe(200)
      expect(result.body.roles).toEqual(['member'])
    })
  })

  it('revalidates historical forged grants and grants issued under forged authority', async () => {
    const rows = await network.bsky.db.db
      .selectFrom('para_community_authority_event')
      .where('communityUri', '=', board)
      .selectAll()
      .execute()
    const template = rows[0]
    const forgedUri = `at://${carol}/com.para.community.authorityEvent/old-expiry-forgery`
    const dependentUri = `at://${carol}/com.para.community.authorityEvent/old-dependent-grant`
    const now = new Date().toISOString()
    await network.bsky.db.db
      .insertInto('para_community_authority_event')
      .values([
        {
          ...template,
          id: forgedUri,
          uri: forgedUri,
          creator: carol,
          subject: carol,
          issuer: carol,
          action: 'owner.grant',
          basis: 'expiry',
          version: 1,
          predecessor: null,
          indexedAt: now,
        },
        {
          ...template,
          id: dependentUri,
          uri: dependentUri,
          creator: carol,
          subject: dan,
          issuer: carol,
          action: 'moderator.grant',
          basis: 'ownerAppointment',
          version: 1,
          predecessor: null,
          evidence: `at://${carol}/com.para.community.decision/forged-appointment`,
          indexedAt: now,
        },
      ])
      .execute()
    await network.bsky.db.db
      .transaction()
      .execute(async (tx) => revalidateAuthority(tx))
    const poisoned = await network.bsky.db.db
      .selectFrom('para_community_authority_event')
      .where('uri', 'in', [forgedUri, dependentUri])
      .select('uri')
      .execute()
    expect(poisoned).toEqual([])
    expect(await rolesOf(bob)).toEqual(['member', 'moderator', 'owner'])
    expect(await rolesOf(alice)).toEqual(['member'])
  })

  describe('board views', () => {
    const summaryName = 'Summary Board'
    let summaryBoard: string
    let summarySlug: string

    type BoardView = {
      uri: string
      status?: string
      governanceSummary?: { moderatorCount: number }
    }
    const listBoards = async (params: Record<string, string>) => {
      const { status, body } = await xrpc<{ boards: BoardView[] }>(
        'com.para.community.listBoards',
        { query: summaryName, ...params },
        alice,
      )
      expect({ status, body }).toMatchObject({ status: 200 })
      return body.boards
    }

    it('summarize the trusted governance record only', async () => {
      summaryBoard = (
        await createCommunityBoardRecord(sc, alice, {
          name: summaryName,
          quadrant: 'centro',
        })
      ).uri
      await network.processAll()
      summarySlug = await boardSlug(summaryBoard)
      const forged = {
        state: 'active',
        matterFlairIds: ['||#Forged'],
      }
      // Published before alice's: carol names the board as alice will, and
      // dan names it by its URI.
      await governanceRecord(
        carol,
        'summary-board',
        `p/${summaryName}`,
        [carol, dan, bob],
        forged,
      )
      await governanceRecord(
        dan,
        'summary-board-uri',
        summaryBoard,
        [dan, carol, bob],
        forged,
      )
      await network.processAll()
      await governanceRecord(alice, summarySlug, `p/${summaryName}`, [alice], {
        state: 'draft',
        matterFlairIds: ['||#Real'],
      })
      await network.processAll()

      const [view, ...rest] = await listBoards({})
      expect(rest).toEqual([])
      expect(view.uri).toBe(summaryBoard)
      expect(view.status).toBe('draft')
      expect(view.governanceSummary?.moderatorCount).toBe(1)

      const uris = (boards: BoardView[]) => boards.map((b) => b.uri)
      expect(uris(await listBoards({ state: 'active' }))).toEqual([])
      expect(uris(await listBoards({ state: 'draft' }))).toEqual([summaryBoard])
      const flair = (flairId: string) =>
        listBoards({ participationKind: 'matter', flairId })
      expect(uris(await flair('||#Forged'))).toEqual([])
      expect(uris(await flair('||#Real'))).toEqual([summaryBoard])
    })

    it('re-index a record the old duplicate check kept out', async () => {
      const db = network.bsky.db.db
      const aliceRecord = `at://${alice}/com.para.community.governance/${summarySlug}`
      const carolRecord = `at://${carol}/com.para.community.governance/summary-board`
      // What the old check did: alice's record named the same community as
      // carol's earlier one, so it was indexed only as a duplicate.
      await db
        .deleteFrom('para_community_governance')
        .where('uri', '=', aliceRecord)
        .execute()
      await db
        .insertInto('duplicate_record')
        .values({
          uri: aliceRecord,
          cid: 'bafyreidummy',
          duplicateOf: carolRecord,
          indexedAt: new Date().toISOString(),
        })
        .execute()

      await reindexGovernance(db)

      const row = await db
        .selectFrom('para_community_governance')
        .where('uri', '=', aliceRecord)
        .select(['moderatorCount', 'state'])
        .executeTakeFirst()
      expect(row).toEqual({ moderatorCount: 1, state: 'draft' })
      const duplicate = await db
        .selectFrom('duplicate_record')
        .where('uri', '=', aliceRecord)
        .select('uri')
        .executeTakeFirst()
      expect(duplicate).toBeUndefined()
    })
  })

  // Runs last: it adds authority events for carol.
  describe('migrated self-declared roles', () => {
    it('are dropped, keeping the board creator’s', async () => {
      const db = network.bsky.db.db
      const carolMembership = await db
        .selectFrom('para_community_membership')
        .where('communityUri', '=', board)
        .where('creator', '=', carol)
        .select(['uri', 'cid', 'joinedAt', 'indexedAt'])
        .executeTakeFirstOrThrow()
      // What `20260929T120000000Z-add-community-authority-events` wrote for a
      // membership record that declared owner and moderator roles.
      const migrated = (
        id: string,
        subject: string,
        action: string,
        version: number,
        community = board,
      ) => ({
        id: `migration:${carolMembership.uri}:${id}:${subject}`,
        uri: carolMembership.uri,
        cid: carolMembership.cid,
        creator: subject,
        communityUri: community,
        subject,
        action,
        issuer: subject,
        effectiveAt: carolMembership.joinedAt,
        version,
        basis: 'migration',
        evidence: carolMembership.uri,
        createdAt: carolMembership.joinedAt,
        indexedAt: carolMembership.indexedAt,
      })
      const legacyBoard = (
        await createCommunityBoardRecord(sc, alice, {
          name: 'Legacy Board',
          quadrant: 'norte',
        })
      ).uri
      await network.processAll()
      await db
        .insertInto('para_community_authority_event')
        .values([
          migrated('member', carol, 'member.activate', 1),
          migrated('owner', carol, 'owner.grant', 2),
          migrated('moderator', carol, 'moderator.grant', 2),
          migrated('member', alice, 'member.activate', 1, legacyBoard),
          migrated('owner', alice, 'owner.grant', 2, legacyBoard),
        ])
        .execute()
      expect(await rolesOf(carol)).toEqual(['member', 'moderator', 'owner'])

      await dropSelfDeclaredRoles(db)

      expect(await rolesOf(carol)).toEqual(['member'])
      expect(await rolesOf(alice, legacyBoard)).toEqual(['member', 'owner'])
      // Verified events are untouched.
      const remaining = await db
        .selectFrom('para_community_authority_event')
        .where('uri', '=', aliceOwner)
        .select('id')
        .execute()
      expect(remaining).toHaveLength(1)
    })
  })
})

// Service-path checks use the real AppView authentication and data-plane route.
