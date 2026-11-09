import { randomUUID } from 'node:crypto'
import { type Kysely, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  usersSeed,
} from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import {
  getGovernanceAuthors,
  isCommunityOwnerSql,
} from '../src/data-plane/server/community-governance.js'
import {
  down as relationsPerAuthorDown,
  up as relationsPerAuthor,
} from '../src/data-plane/server/db/migrations/20261104T120000000Z-community-relations-per-author.js'
import { appointModerator } from './_util.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

type StrongRef = { uri: string; cid: string }
type SharedItem = {
  uri: string
  removed?: boolean
  removedBy?: string
  latestAction?: { uri: string }
}

// Two ways an account without verified authority could steer community
// moderation, and one way a legitimate appointment used to be lost:
// - a `sharedContentAction` record that anyone can write into their own repo;
// - the PDS moderation route, which trusted self-written membership roles;
// - an owner appointment of a member who joined with `community.join` only,
//   which left the appointee with no membership at all.
maybeDescribe('community moderation authority', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // founder and owner
  let bob: DidString // joins by authority event, appointed moderator
  let carol: DidString // member who declares herself owner and moderator
  let dan: DidString // outsider
  let eve: DidString // joins with a membership record only
  let frank: DidString // joins with a membership record only
  let board: string
  let otherBoard: string
  let bobModerator: string
  let eveMembership: string
  let gina: DidString // joins otherBoard by authority event, then leaves
  let hank: DidString // joins otherBoard by authority event, owns it, leaves

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

  const pdsProcedure = async (
    by: DidString,
    nsid: string,
    input: Record<string, unknown>,
  ) => {
    const res = await fetch(new URL(`/xrpc/${nsid}`, network.pds.url), {
      method: 'POST',
      headers: { ...sc.getHeaders(by), 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return {
      status: res.status,
      body: (await res.json()) as { error?: string },
    }
  }

  const rolesOf = async (viewer: string, community = board) => {
    const { status, body } = await xrpc<{
      board: { viewerRoles?: string[] }
    }>('com.para.community.getBoard', { uri: community }, viewer)
    expect({ status, body }).toMatchObject({ status: 200 })
    return (body.board.viewerRoles ?? []).sort()
  }

  const write = async (
    by: DidString,
    collection: string,
    record: Record<string, unknown>,
    rkey?: string,
  ): Promise<StrongRef> => {
    const input = {
      repo: by,
      collection,
      record: { $type: collection, ...record },
    }
    const opts = {
      encoding: 'application/json' as const,
      headers: sc.getHeaders(by),
    }
    const { data } = rkey
      ? await sc.agent.com.atproto.repo.putRecord({ ...input, rkey }, opts)
      : await sc.agent.com.atproto.repo.createRecord(input, opts)
    return { uri: data.uri, cid: data.cid }
  }

  const authorityEvent = async (
    issuer: DidString,
    event: {
      subject: string
      action: string
      basis: string
      version: number
      predecessor?: string
      evidence?: string
      effectiveAt?: string
    },
    community = board,
  ) =>
    (
      await write(issuer, 'com.para.community.authorityEvent', {
        community,
        issuer,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
        ...event,
      })
    ).uri

  const found = async (founder: DidString, community: string) => {
    const member = await authorityEvent(
      founder,
      {
        subject: founder,
        action: 'member.activate',
        basis: 'foundingTransition',
        version: 1,
      },
      community,
    )
    await network.processAll()
    await authorityEvent(
      founder,
      {
        subject: founder,
        action: 'owner.grant',
        basis: 'foundingTransition',
        version: 2,
        predecessor: member,
      },
      community,
    )
  }

  const share = async (community = board) => {
    const post = await sc.post(dan, `shared ${randomUUID()}`)
    const ref = await write(dan, 'com.para.community.sharedContent', {
      subject: { uri: post.ref.uriStr, cid: post.ref.cidStr },
      communityUri: community,
      contentType: 'post',
      sharedBy: dan,
      createdAt: new Date().toISOString(),
    })
    await network.processAll()
    return ref
  }

  const moderate = (
    by: DidString,
    sharedContent: StrongRef,
    action: 'remove' | 'restore',
    opts: { community?: string; createdAt?: string } = {},
  ) =>
    write(by, 'com.para.community.sharedContentAction', {
      sharedContent,
      communityUri: opts.community ?? board,
      action,
      createdAt: opts.createdAt ?? new Date().toISOString(),
    })

  // The item as a verified moderator sees it, removed items included.
  const itemOf = async (item: StrongRef, community = board) => {
    const { status, body } = await xrpc<{ items: SharedItem[] }>(
      'com.para.community.listSharedContent',
      { communityUri: community, includeRemoved: 'true' },
      alice,
    )
    expect({ status, body }).toMatchObject({ status: 200 })
    const found = body.items.find((candidate) => candidate.uri === item.uri)
    expect(found).toBeDefined()
    return found as SharedItem
  }

  // Whether the item is shown to an ordinary reader.
  const isListed = async (item: StrongRef) => {
    const { body } = await xrpc<{ items: SharedItem[] }>(
      'com.para.community.listSharedContent',
      { communityUri: board },
    )
    return body.items.some((candidate) => candidate.uri === item.uri)
  }

  const boardSlug = async (uri: string) => {
    const row = await network.bsky.db.db
      .selectFrom('para_community_board')
      .where('uri', '=', uri)
      .select('slug')
      .executeTakeFirstOrThrow()
    return row.slug as string
  }

  const farFuture = new Date(Date.now() + 365 * 86400000).toISOString()

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_moderation_authority_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)
    for (const name of ['eve', 'frank', 'gina', 'hank']) {
      await sc.createAccount(name, {
        handle: `${name}.test`,
        email: `${name}@test.com`,
        password: `${name}-pass`,
      })
    }
    ;({ eve, frank, gina, hank } = sc.dids)

    board = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Moderation Board',
        quadrant: 'center',
      })
    ).uri
    otherBoard = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Other Board',
        quadrant: 'sur',
      })
    ).uri
    await network.processAll()
    await found(alice, board)
    await found(alice, otherBoard)

    const bobMember = await authorityEvent(bob, {
      subject: bob,
      action: 'member.activate',
      basis: 'openAdmission',
      version: 1,
    })
    await network.processAll()
    // An appointment needs the nominee's acceptance of an offer.
    ;({ appointment: bobModerator } = await appointModerator({
      sc,
      network,
      community: board,
      owner: alice,
      nominee: bob,
      predecessor: bobMember,
    }))
    await write(carol, 'com.para.community.membership', {
      community: board,
      membershipState: 'active',
      roles: ['owner', 'moderator', 'steward'],
      joinedAt: new Date().toISOString(),
    })
    eveMembership = (
      await createCommunityMembershipRecord(sc, eve, board, 'active')
    ).uri
    await createCommunityMembershipRecord(sc, frank, board, 'active')
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  describe('shared content actions', () => {
    it('ignore removals by accounts without verified authority', async () => {
      const item = await share()
      // carol's self-declared roles and dan's lack of any membership both
      // count for nothing, even dated a year ahead.
      await moderate(carol, item, 'remove', { createdAt: farFuture })
      await moderate(dan, item, 'remove', { createdAt: farFuture })
      await network.processAll()

      expect(await isListed(item)).toBe(true)
      const view = await itemOf(item)
      expect(view.removed ?? false).toBe(false)
      expect(view.latestAction).toBeUndefined()
    })

    it("apply a verified moderator's removal", async () => {
      const item = await share()
      await moderate(bob, item, 'remove')
      await network.processAll()

      expect(await isListed(item)).toBe(false)
      const view = await itemOf(item)
      expect(view.removed).toBe(true)
      expect(view.removedBy).toBe(bob)
    })

    it('do not let a forged restore override a verified removal', async () => {
      const item = await share()
      await moderate(bob, item, 'remove')
      await network.processAll()
      await moderate(carol, item, 'restore', { createdAt: farFuture })
      await network.processAll()

      expect(await isListed(item)).toBe(false)
      expect((await itemOf(item)).removedBy).toBe(bob)
    })

    it('do not let a future date pin a verified action on top', async () => {
      const item = await share()
      await moderate(bob, item, 'remove', { createdAt: farFuture })
      await network.processAll()
      await moderate(alice, item, 'restore')
      await network.processAll()

      expect(await isListed(item)).toBe(true)
    })

    it('ignore an action naming a different community', async () => {
      const item = await share()
      // alice owns otherBoard too, but the item was shared into board.
      await moderate(alice, item, 'remove', { community: otherBoard })
      await network.processAll()

      expect(await isListed(item)).toBe(true)
    })

    it('are refused by the PDS route without verified authority', async () => {
      const item = await share()
      const input = { communityUri: board, sharedContent: item }
      const forged = await pdsProcedure(
        carol,
        'com.para.community.removeSharedContent',
        input,
      )
      expect(forged).toMatchObject({
        status: 400,
        body: { error: 'CommunityStewardRequired' },
      })

      const verified = await pdsProcedure(
        bob,
        'com.para.community.removeSharedContent',
        input,
      )
      expect(verified.status).toBe(200)
      await network.processAll()
      expect(await isListed(item)).toBe(false)
    })
  })

  describe('owner appointment of a member who joined by membership record', () => {
    it('keeps the membership and grants the role', async () => {
      expect(await rolesOf(eve)).toEqual(['member'])
      // eve has no authority event yet: the appointment opens her chain.
      const { acceptance } = await appointModerator({
        sc,
        network,
        community: board,
        owner: alice,
        nominee: eve,
        version: 1,
      })
      await network.processAll()

      expect(await rolesOf(eve)).toEqual(['member', 'moderator'])
      const { body } = await xrpc<{
        roleHolders: Array<{ did: string; role: string; evidence: string }>
      }>('com.para.community.getGovernance', {
        community: await boardSlug(board),
      })
      expect(
        body.roleHolders
          .filter((holder) => holder.did === eve)
          .map(({ role, evidence }) => ({ role, evidence }))
          .sort((a, b) => a.role.localeCompare(b.role)),
      ).toEqual([
        { role: 'member', evidence: eveMembership },
        { role: 'moderator', evidence: acceptance },
      ])
    })

    it('lets the appointee moderate shared content', async () => {
      const item = await share()
      await moderate(eve, item, 'remove')
      await network.processAll()
      expect(await isListed(item)).toBe(false)
    })

    it('makes an owner by transfer a governance author', async () => {
      await authorityEvent(alice, {
        subject: frank,
        action: 'owner.grant',
        basis: 'ownerTransfer',
        version: 1,
        evidence: `at://${alice}/com.para.community.decision/transfer-frank`,
      })
      await network.processAll()

      expect(await rolesOf(frank)).toEqual(['member', 'owner'])
      expect(
        (
          await getGovernanceAuthors(network.bsky.db, {
            uri: board,
            creator: alice,
          })
        ).sort(),
      ).toEqual([alice, frank].sort())
      // The SQL twin agrees with the derived snapshot.
      const { rows } = await sql<{
        owner: boolean
      }>`select ${isCommunityOwnerSql(sql`${board}`, sql`${frank}`)} as owner`.execute(
        network.bsky.db.db,
      )
      expect(rows[0]?.owner).toBe(true)
    })

    it('ends with the membership record when the member leaves', async () => {
      await write(
        eve,
        'com.para.community.membership',
        {
          community: board,
          membershipState: 'left',
          joinedAt: new Date().toISOString(),
          leftAt: new Date().toISOString(),
        },
        eveMembership.split('/').pop(),
      )
      await network.processAll()
      expect(await rolesOf(eve)).toEqual([])
    })
  })

  describe('community relations', () => {
    let danBoard: string
    let frankBoard: string

    const relate = (by: DidString, parent: string, child: string) =>
      write(by, 'com.para.community.relation', {
        parentCommunityUri: parent,
        childCommunityUri: child,
        relation: 'parentChild',
        createdAt: new Date().toISOString(),
      })

    const childrenOf = async (community: string) => {
      const { status, body } = await xrpc<{
        relations: Array<{ childCommunityUri: string; createdBy: string }>
      }>('com.para.community.listChildCommunities', {
        communityUri: community,
      })
      expect({ status, body }).toMatchObject({ status: 200 })
      return body.relations.map((relation) => relation.childCommunityUri)
    }

    beforeAll(async () => {
      danBoard = (
        await createCommunityBoardRecord(sc, dan, {
          name: 'Dan Board',
          quadrant: 'norte',
        })
      ).uri
      frankBoard = (
        await createCommunityBoardRecord(sc, frank, {
          name: 'Frank Board',
          quadrant: 'oriente',
        })
      ).uri
      await network.processAll()
      await found(dan, danBoard)
      await found(frank, frankBoard)
      await network.processAll()
    })

    it("ignore a link into a community its author doesn't own", async () => {
      // dan owns danBoard, but not board.
      await relate(dan, board, danBoard)
      await network.processAll()
      expect(await childrenOf(board)).toEqual([])

      // dan's content in danBoard does not reach board's listing either.
      const item = await share(danBoard)
      const { body } = await xrpc<{ items: SharedItem[] }>(
        'com.para.community.listSharedContent',
        { communityUri: board, includeChildren: 'true' },
      )
      expect(body.items.map((candidate) => candidate.uri)).not.toContain(
        item.uri,
      )
    })

    it("count a link by the parent's owner", async () => {
      await relate(alice, board, danBoard)
      await network.processAll()
      expect(await childrenOf(board)).toEqual([danBoard])
    })

    it("count a founding owner's link, not a non-owner's", async () => {
      // Every community is hierarchical: its founder links as its owner.
      await relate(carol, frankBoard, otherBoard)
      await network.processAll()
      expect(await childrenOf(frankBoard)).toEqual([])

      await relate(frank, frankBoard, danBoard)
      await network.processAll()
      expect(await childrenOf(frankBoard)).toEqual([danBoard])
    })

    it("are not blocked by someone else's reverse link", async () => {
      // carol writes the reverse first; the owner's link must still index.
      await relate(carol, danBoard, otherBoard)
      await network.processAll()
      await relate(alice, otherBoard, danBoard)
      await network.processAll()
      expect(await childrenOf(otherBoard)).toEqual([danBoard])
    })

    it('are re-indexed by the migration when an earlier index turned them away', async () => {
      // As the old per-pair index left it: only carol's row for the pair.
      const db = network.bsky.db.db
      const link = await relate(alice, frankBoard, otherBoard)
      await network.processAll()
      await db
        .deleteFrom('para_community_relation')
        .where('uri', '=', link.uri)
        .execute()
      expect(await childrenOf(frankBoard)).toEqual([danBoard])

      await relationsPerAuthorDown(db as Kysely<unknown>)
      await relationsPerAuthor(db as Kysely<unknown>)
      // alice is no owner of frank's board, so the restored row is
      // indexed but still not trusted; frank's link stays.
      const restored = await db
        .selectFrom('para_community_relation')
        .where('uri', '=', link.uri)
        .select('creator')
        .executeTakeFirst()
      expect(restored?.creator).toBe(alice)
      expect(await childrenOf(frankBoard)).toEqual([danBoard])
    })
  })

  describe('briefing packs', () => {
    const pack = (by: DidString, title: string) =>
      write(by, 'com.para.community.briefingPack', {
        packType: 'party_lobbying',
        communityUri: board,
        party: 'Independent',
        title,
        summary: 'summary',
        cabildeoUris: [],
        civicTreeCardIds: [],
        evidenceUris: [],
        status: 'published',
        createdBy: by,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

    const listedTitles = async () => {
      const { status, body } = await xrpc<{ packs: Array<{ title: string }> }>(
        'com.para.community.listBriefingPacks',
        { community: board },
      )
      expect({ status, body }).toMatchObject({ status: 200 })
      return body.packs.map((listed) => listed.title).sort()
    }

    it('list only packs by an owner or moderator', async () => {
      const forged = await pack(dan, 'by dan')
      await pack(carol, 'by carol')
      await pack(alice, 'by alice')
      await pack(bob, 'by bob')
      await network.processAll()

      expect(await listedTitles()).toEqual(['by alice', 'by bob'])
      const single = await xrpc<{ error?: string }>(
        'com.para.community.getBriefingPack',
        { uri: forged.uri },
      )
      expect(single.status).toBe(400)
      expect(single.body.error).toBe('NotFound')
    })

    it('are refused by the PDS route without verified authority', async () => {
      const input = {
        packType: 'party_lobbying',
        communityUri: board,
        party: 'Independent',
        title: 'via pds',
        summary: 'summary',
      }
      expect(
        await pdsProcedure(
          carol,
          'com.para.community.createBriefingPack',
          input,
        ),
      ).toMatchObject({
        status: 400,
        body: { error: 'CommunityStewardRequired' },
      })
      const created = await pdsProcedure(
        alice,
        'com.para.community.createBriefingPack',
        input,
      )
      expect(created.status).toBe(200)
    })
  })

  describe('leaving', () => {
    beforeAll(async () => {
      // gina joins otherBoard by authority event and alice appoints her.
      const ginaMember = await authorityEvent(
        gina,
        {
          subject: gina,
          action: 'member.activate',
          basis: 'openAdmission',
          version: 1,
        },
        otherBoard,
      )
      await network.processAll()
      await appointModerator({
        sc,
        network,
        community: otherBoard,
        owner: alice,
        nominee: gina,
        predecessor: ginaMember,
      })
      await pdsProcedure(gina, 'com.para.community.join', {
        communityUri: otherBoard,
      })
      // hank joins by authority event too, then alice transfers ownership.
      const hankMember = await authorityEvent(
        hank,
        {
          subject: hank,
          action: 'member.activate',
          basis: 'openAdmission',
          version: 1,
        },
        otherBoard,
      )
      await pdsProcedure(hank, 'com.para.community.join', {
        communityUri: otherBoard,
      })
      await network.processAll()
      await authorityEvent(
        alice,
        {
          subject: hank,
          action: 'owner.grant',
          basis: 'ownerTransfer',
          version: 2,
          predecessor: hankMember,
          evidence: `at://${alice}/com.para.community.decision/transfer-hank`,
        },
        otherBoard,
      )
      await network.processAll()
    })

    const ownsOtherBoard = async (did: string) => {
      const { rows } = await sql<{
        owner: boolean
      }>`select ${isCommunityOwnerSql(sql`${otherBoard}`, sql`${did}`)} as owner`.execute(
        network.bsky.db.db,
      )
      return rows[0]?.owner
    }

    it('ends membership and offices for a member with an activation event', async () => {
      expect(await rolesOf(gina, otherBoard)).toEqual(['member', 'moderator'])
      const left = await pdsProcedure(gina, 'com.para.community.leave', {
        communityUri: otherBoard,
      })
      expect(left.status).toBe(200)
      await network.processAll()
      expect(await rolesOf(gina, otherBoard)).toEqual([])
    })

    it('ends ownership in both the snapshot and its SQL twin', async () => {
      expect(await rolesOf(hank, otherBoard)).toEqual(['member', 'owner'])
      expect(await ownsOtherBoard(hank)).toBe(true)
      await pdsProcedure(hank, 'com.para.community.leave', {
        communityUri: otherBoard,
      })
      await network.processAll()
      expect(await rolesOf(hank, otherBoard)).toEqual([])
      expect(await ownsOtherBoard(hank)).toBe(false)
      expect(
        await getGovernanceAuthors(network.bsky.db, {
          uri: otherBoard,
          creator: alice,
        }),
      ).toEqual([alice])
    })

    it('restores unrevoked offices when the member rejoins', async () => {
      // A rewritten record forgets the leave; see `leftBeforeRejoining`.
      await pdsProcedure(gina, 'com.para.community.join', {
        communityUri: otherBoard,
      })
      await network.processAll()
      expect(await rolesOf(gina, otherBoard)).toEqual(['member', 'moderator'])
    })
  })

  it('keeps a moderator removal after the moderator is revoked', async () => {
    const item = await share()
    await moderate(bob, item, 'remove')
    await network.processAll()
    await authorityEvent(alice, {
      subject: bob,
      action: 'moderator.revoke',
      basis: 'ownerAppointment',
      version: 3,
      predecessor: bobModerator,
      // A revocation names the appointment it ends.
      evidence: bobModerator,
      // Effective now, after the removal above was indexed.
      effectiveAt: new Date().toISOString(),
    })
    await network.processAll()
    expect(await rolesOf(bob)).toEqual(['member'])
    expect(await isListed(item)).toBe(false)

    // A restore written after the revocation no longer counts.
    await moderate(bob, item, 'restore')
    await network.processAll()
    expect(await isListed(item)).toBe(false)
  })
})
