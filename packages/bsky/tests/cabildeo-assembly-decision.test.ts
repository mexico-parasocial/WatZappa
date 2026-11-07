import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createCommunityMembershipRecord,
  usersSeed,
} from '@atproto/dev-env'
import { AtUri, type DidString } from '@atproto/syntax'
import {
  getAuthoritySnapshot,
  verifyAuthorityEvent,
} from '../src/data-plane/server/community-authority.js'
import { getCabildeoVoteEligibility } from '../src/data-plane/server/indexing/plugins/cabildeo-vote.js'
import { finalizeDueCabildeos } from '../src/data-plane/server/indexing/plugins/finalize-cabildeos.js'
import { recomputeCabildeoAggregates } from '../src/data-plane/server/indexing/plugins/recompute-cabildeo-aggregates.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

const stranger = (letter: string) => `did:plc:${letter.repeat(24)}` as DidString

// A cabildeo that names a `protectedAction` grounds an authority event only
// once its assembly has decided it: the AppView recomputes quorum and threshold
// from the final tally and from authority events alone, so nothing the author,
// the issuer or a member's own record says can stand in for the vote.
maybeDescribe('assembly decisions grounding authority events', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // founder and owner of the gated board
  let bob: DidString // assembly member
  let carol: DidString // assembly member
  let dan: DidString // writes a membership record himself
  let board: { uri: string; cid: string }
  let openBoard: { uri: string; cid: string }
  let nullifier = 0

  const write = async (
    by: DidString,
    collection: string,
    record: Record<string, unknown>,
    rkey?: string,
  ) => {
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

  const createBoard = (
    by: DidString,
    name: string,
    admissionMode: 'open' | 'assembly_approval',
  ) =>
    write(by, 'com.para.community.board', {
      name,
      quadrant: 'center',
      admissionMode,
      delegatesChatId: 'center-delegates',
      subdelegatesChatId: 'center-subdelegates',
      status: 'active',
      createdAt: new Date().toISOString(),
    })

  // Members the way a migrated community has them: an authority event each.
  const grandfather = async (community: string, did: string) => {
    const uri = `at://${did}/com.para.community.authorityEvent/${randomUUID()}`
    await network.bsky.db.db
      .insertInto('para_community_authority_event')
      .values({
        id: uri,
        uri,
        cid: board.cid,
        creator: did,
        communityUri: community,
        subject: did,
        action: 'member.activate',
        issuer: did,
        effectiveAt: new Date(Date.now() - 86_400_000).toISOString(),
        expiresAt: null,
        predecessor: null,
        version: 1,
        basis: 'migration',
        evidence: null,
        createdAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
      })
      .execute()
    return uri
  }

  const cabildeo = async (
    protectedAction: unknown,
    opts: { community?: string; rkey?: string } = {},
  ) =>
    (
      await write(
        alice,
        'com.para.civic.cabildeo',
        {
          title: 'La asamblea decide',
          description: 'Una decisión protegida.',
          community: opts.community ?? board.uri,
          phase: 'voting',
          phaseDeadline: new Date(Date.now() + 3_600_000).toISOString(),
          options: [{ label: 'Aprobar' }, { label: 'Rechazar' }],
          ...(protectedAction === undefined ? {} : { protectedAction }),
          createdAt: new Date().toISOString(),
        },
        opts.rkey,
      )
    ).uri

  // Ballots go straight into the index: the m8 proof is not what is under test.
  const ballots = async (uri: string, cast: Array<[string, number]>) => {
    for (const [creator, selectedOption] of cast) {
      const at = new Date(Date.now() - 600_000).toISOString()
      await network.bsky.db.db
        .insertInto('cabildeo_vote')
        .values({
          uri: `at://${creator}/com.para.civic.vote/${randomUUID()}`,
          cid: board.cid,
          creator,
          cabildeo: uri,
          selectedOption,
          isDirect: 1,
          delegatedFrom: null,
          voteNullifier: String(++nullifier).padStart(64, '0'),
          eligibilityProofRef: null,
          createdAt: at,
          indexedAt: at,
        })
        .execute()
    }
  }

  // Voting stayed open `openDays` days before it closed a minute ago.
  const close = async (uri: string, openDays = 4) => {
    await network.bsky.db.db
      .updateTable('cabildeo_close_policy')
      .set({
        deadline: new Date(Date.now() - 60_000).toISOString(),
        openedAt: new Date(Date.now() - openDays * 86_400_000).toISOString(),
      })
      .where('cabildeo', '=', uri)
      .execute()
    await finalizeDueCabildeos(network.bsky.db.db)
  }

  const decide = async (
    issuer: DidString,
    event: {
      subject: string
      action: string
      evidence: string
      version?: number
      predecessor?: string
    },
    community = board.uri,
  ) => {
    await write(issuer, 'com.para.community.authorityEvent', {
      community,
      issuer,
      basis: 'assemblyDecision',
      version: 1,
      effectiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...event,
    })
    await network.processAll()
  }

  const decisionsFor = async (subject: string) =>
    network.bsky.db.db
      .selectFrom('para_community_authority_event')
      .where('subject', '=', subject)
      .where('basis', '=', 'assemblyDecision')
      .select(['action', 'version', 'uri'])
      .orderBy('version')
      .execute()

  const authority = (subject: string, community = board.uri) =>
    getAuthoritySnapshot(network.bsky.db, community, subject)

  // Resolves a cabildeo with the given ballots and publishes the event.
  const resolve = async (
    protectedAction: unknown,
    cast: Array<[string, number]>,
    opts: { community?: string; rkey?: string } = {},
  ) => {
    const uri = await cabildeo(protectedAction, opts)
    await network.processAll()
    await ballots(uri, cast)
    await close(uri)
    return uri
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema:
        'para_assembly_decision_' +
        randomUUID()
          .replaceAll('-', '')
          .replace(/[0-9]/g, (digit) =>
            String.fromCharCode(103 + Number(digit)),
          ),
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, carol, dan } = sc.dids)
    board = await createBoard(alice, 'Gated Board', 'assembly_approval')
    openBoard = await createBoard(alice, 'Open Board', 'open')
    await network.processAll()
    // alice founds the gated board; bob and carol are its other members.
    const founded = await write(alice, 'com.para.community.authorityEvent', {
      community: board.uri,
      subject: alice,
      action: 'member.activate',
      issuer: alice,
      basis: 'foundingTransition',
      version: 1,
      effectiveAt: new Date(Date.now() - 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
    })
    await network.processAll()
    await write(alice, 'com.para.community.authorityEvent', {
      community: board.uri,
      subject: alice,
      action: 'owner.grant',
      issuer: alice,
      basis: 'foundingTransition',
      version: 2,
      predecessor: founded.uri,
      effectiveAt: new Date(Date.now() - 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
    })
    await grandfather(board.uri, bob)
    await grandfather(board.uri, carol)
    await grandfather(openBoard.uri, alice)
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('refuses an approval the assembly rejected', async () => {
    const subject = stranger('b')
    const evidence = await resolve({ action: 'membership.approve', subject }, [
      [alice, 0],
      [bob, 1],
      [carol, 1],
    ])
    await decide(alice, { subject, action: 'member.activate', evidence })
    expect(await decisionsFor(subject)).toHaveLength(0)
  })

  it('refuses a decision below quorum', async () => {
    const subject = stranger('c')
    const evidence = await resolve({ action: 'membership.approve', subject }, [
      [alice, 0],
      [bob, 0],
    ])
    await decide(alice, { subject, action: 'member.activate', evidence })
    expect(await decisionsFor(subject)).toHaveLength(0)
  })

  it('counts only members by authority events', async () => {
    // dan wrote a membership record himself and a stranger has none. Neither is
    // in the assembly of three, so the two yes votes that would carry it with
    // bob's no are really one: alice's, with carol silent and no quorum.
    await createCommunityMembershipRecord(sc, dan, board.uri, 'active')
    await network.processAll()
    const subject = stranger('d')
    const evidence = await resolve({ action: 'membership.approve', subject }, [
      [alice, 0],
      [stranger('e'), 0],
      [dan, 0],
      [bob, 1],
    ])
    await decide(alice, { subject, action: 'member.activate', evidence })
    expect(await decisionsFor(subject)).toHaveLength(0)
  })

  it('refuses a cabildeo whose claim changed after voting opened', async () => {
    const swapped = stranger('f')
    const rkey = `swap${randomUUID().replaceAll('-', '').slice(0, 8)}`
    const uri = await cabildeo(
      { action: 'membership.approve', subject: stranger('g') },
      { rkey },
    )
    await network.processAll()
    await ballots(uri, [
      [alice, 0],
      [bob, 0],
      [carol, 0],
    ])
    // The author swaps the subject once the ballots are in.
    await cabildeo({ action: 'membership.approve', subject: swapped }, { rkey })
    await network.processAll()
    await close(uri)
    await decide(alice, {
      subject: swapped,
      action: 'member.activate',
      evidence: uri,
    })
    await decide(alice, {
      subject: stranger('g'),
      action: 'member.activate',
      evidence: uri,
    })
    expect(await decisionsFor(swapped)).toHaveLength(0)
    expect(await decisionsFor(stranger('g'))).toHaveLength(0)
  })

  it('refuses a cabildeo that names its community by slug', async () => {
    const subject = stranger('h')
    const slug = (
      await network.bsky.db.db
        .selectFrom('para_community_board')
        .where('uri', '=', board.uri)
        .select('slug')
        .executeTakeFirstOrThrow()
    ).slug as string
    const evidence = await resolve(
      { action: 'membership.approve', subject },
      [
        [alice, 0],
        [bob, 0],
        [carol, 0],
      ],
      { community: slug },
    )
    await decide(alice, { subject, action: 'member.activate', evidence })
    expect(await decisionsFor(subject)).toHaveLength(0)
  })

  it('refuses a vote that was not open for 72 hours', async () => {
    const view = async (uri: string) =>
      JSON.parse(
        (
          await network.bsky.ctx.dataplane.getParaCabildeo({
            cabildeoUri: uri,
            viewerDid: bob,
          })
        ).cabildeoJson,
      ).assemblyDecision
    const cast: Array<[string, number]> = [
      [alice, 0],
      [bob, 0],
      [carol, 0],
    ]

    const hurried = stranger('s')
    const hurriedUri = await cabildeo({
      action: 'membership.approve',
      subject: hurried,
    })
    await network.processAll()
    await ballots(hurriedUri, cast)
    await close(hurriedUri, 71 / 24)
    await decide(alice, {
      subject: hurried,
      action: 'member.activate',
      evidence: hurriedUri,
    })
    expect(await decisionsFor(hurried)).toHaveLength(0)
    expect(await view(hurriedUri)).toEqual({ problem: 'too-short' })

    const heard = stranger('t')
    const heardUri = await cabildeo({
      action: 'membership.approve',
      subject: heard,
    })
    await network.processAll()
    await ballots(heardUri, cast)
    await close(heardUri, 73 / 24)
    expect((await view(heardUri)).event).toBeDefined()
    await decide(alice, {
      subject: heard,
      action: 'member.activate',
      evidence: heardUri,
    })
    expect(await decisionsFor(heard)).toHaveLength(1)
  })

  it('does not admit by assembly into an open community', async () => {
    const subject = stranger('i')
    const evidence = await resolve(
      { action: 'membership.approve', subject },
      [[alice, 0]],
      { community: openBoard.uri },
    )
    await decide(
      alice,
      { subject, action: 'member.activate', evidence },
      openBoard.uri,
    )
    expect(await decisionsFor(subject)).toHaveLength(0)
  })

  it('refuses an event the claimed action cannot produce', async () => {
    const subject = stranger('j')
    const everyone: Array<[string, number]> = [
      [alice, 0],
      [bob, 0],
      [carol, 0],
    ]
    const election = await resolve(
      { action: 'moderator.elect', subject },
      everyone,
    )
    await decide(alice, {
      subject,
      action: 'moderator.grant',
      evidence: election,
    })
    const approval = await resolve(
      { action: 'membership.approve', subject },
      everyone,
    )
    await decide(alice, { subject, action: 'owner.grant', evidence: approval })
    expect(await decisionsFor(subject)).toHaveLength(0)
  })

  it('recovers ownership only by a supermajority', async () => {
    const [bobMember] = await network.bsky.db.db
      .selectFrom('para_community_authority_event')
      .where('subject', '=', bob)
      .where('communityUri', '=', board.uri)
      .select('uri')
      .execute()
    const split = await resolve({ action: 'owner.recover', subject: bob }, [
      [alice, 0],
      [bob, 0],
      [carol, 1],
    ])
    // Two of three is exactly two thirds: enough.
    await decide(carol, {
      subject: bob,
      action: 'owner.grant',
      evidence: split,
      version: 2,
      predecessor: bobMember.uri,
    })
    expect((await authority(bob)).roles).toContain('owner')

    const narrow = await resolve({ action: 'owner.recover', subject: carol }, [
      [alice, 0],
      [bob, 1],
      [carol, 1],
    ])
    const [carolMember] = await network.bsky.db.db
      .selectFrom('para_community_authority_event')
      .where('subject', '=', carol)
      .where('communityUri', '=', board.uri)
      .select('uri')
      .execute()
    await decide(carol, {
      subject: carol,
      action: 'owner.grant',
      evidence: narrow,
      version: 2,
      predecessor: carolMember.uri,
    })
    expect((await authority(carol)).roles).not.toContain('owner')
  })

  it('accepts the evidence only in its canonical spelling', async () => {
    // `.../rkey/` parses to the same cabildeo, but "one cabildeo, one event"
    // compares strings, so a second spelling would spend it twice. The record
    // format already refuses it on write; the verifier does not rely on that.
    const subject = stranger('m')
    const evidence = await resolve({ action: 'membership.approve', subject }, [
      [alice, 0],
      [bob, 0],
      [carol, 0],
    ])
    const verify = (spelled: string) =>
      verifyAuthorityEvent(
        network.bsky.db,
        new AtUri(`at://${dan}/com.para.community.authorityEvent/probe`),
        {
          community: board.uri,
          subject,
          action: 'member.activate',
          issuer: dan,
          effectiveAt: new Date().toISOString(),
          version: 1,
          basis: 'assemblyDecision',
          evidence: spelled,
        },
      )
    expect(await verify(evidence)).toBe(true)
    expect(await verify(`${evidence}/`)).toBe(false)
  })

  it('judges a voter by authority events, not by their own record', async () => {
    // dan's own membership record (written above) says active, but an assembly
    // removed him: the events decide, in ballot admission and in the tally.
    const joined = await grandfather(board.uri, dan)
    const removal = `at://${dan}/com.para.community.authorityEvent/${randomUUID()}`
    await network.bsky.db.db
      .insertInto('para_community_authority_event')
      .values({
        id: removal,
        uri: removal,
        cid: board.cid,
        creator: dan,
        communityUri: board.uri,
        subject: dan,
        action: 'member.remove',
        issuer: dan,
        effectiveAt: new Date(Date.now() - 3_600_000).toISOString(),
        expiresAt: null,
        predecessor: joined,
        version: 2,
        basis: 'assemblyDecision',
        evidence: null,
        createdAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
      })
      .execute()
    const uri = await cabildeo(undefined)
    await network.processAll()
    const eligible = (did: string) =>
      getCabildeoVoteEligibility(network.bsky.db.db, {
        actorDid: did,
        cabildeoUri: uri,
        selectedOption: 0,
        indexedAt: new Date().toISOString(),
      })
    expect(await eligible(alice)).toBeTruthy()
    expect(await eligible(dan)).toBeNull()

    // A ballot that got in before the removal stops counting at tally time.
    await ballots(uri, [
      [alice, 0],
      [dan, 0],
    ])
    await recomputeCabildeoAggregates(network.bsky.db.db, uri)
    const tally = await network.bsky.db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', uri)
      .select(['voteCount', 'optionVoteCounts'])
      .executeTakeFirstOrThrow()
    expect(tally.voteCount).toBe(1)
    expect(tally.optionVoteCounts).toEqual([1, 0])
  })

  it('tells a client which event to publish, and when none', async () => {
    const dataplaneView = async (uri: string) =>
      JSON.parse(
        (
          await network.bsky.ctx.dataplane.getParaCabildeo({
            cabildeoUri: uri,
            viewerDid: bob,
          })
        ).cabildeoJson,
      )

    // Approved: the next link in the applicant's chain (none yet: version 1).
    const applicant = stranger('m')
    const approved = await resolve(
      { action: 'membership.approve', subject: applicant },
      [
        [alice, 0],
        [bob, 0],
        [carol, 1],
      ],
    )
    const approvedView = (await dataplaneView(approved)).assemblyDecision
    expect(approvedView.outcome).toMatchObject({
      approved: true,
      reason: 'approved',
      electorate: 3,
      participants: 3,
      approvals: 2,
      rejections: 1,
    })
    expect(approvedView.event).toEqual({
      action: 'member.activate',
      subject: applicant,
      version: 1,
      evidence: approved,
    })

    // Rejected: the count is shown and there is nothing to publish.
    const rejected = await resolve(
      { action: 'membership.approve', subject: stranger('n') },
      [
        [alice, 1],
        [bob, 1],
        [carol, 0],
      ],
    )
    const rejectedView = (await dataplaneView(rejected)).assemblyDecision
    expect(rejectedView.outcome).toMatchObject({
      approved: false,
      reason: 'threshold-not-met',
    })
    expect(rejectedView.event).toBeUndefined()

    // A cabildeo that names its board by slug cannot ground an event, and the
    // view says why instead of offering one.
    const bySlug = await resolve(
      { action: 'membership.approve', subject: stranger('o') },
      [[alice, 0]],
      { community: 'gated-board' },
    )
    expect((await dataplaneView(bySlug)).assemblyDecision).toEqual({
      problem: 'wrong-community',
    })

    // Recovering ownership revokes a sitting owner and grants anyone else.
    const recover = await resolve({ action: 'owner.recover', subject: alice }, [
      [alice, 0],
      [bob, 0],
      [carol, 0],
    ])
    const recoverView = (await dataplaneView(recover)).assemblyDecision
    expect(recoverView.event).toMatchObject({
      action: 'owner.revoke',
      subject: alice,
      version: 3,
    })
    expect(typeof recoverView.event.predecessor).toBe('string')
  })

  it('admits an applicant the assembly approved, once', async () => {
    // Last on purpose: the applicant joins the assembly, which changes quorum.
    const applicant = stranger('k')
    const evidence = await resolve(
      { action: 'membership.approve', subject: applicant },
      [
        [alice, 0],
        [bob, 0],
        [carol, 1],
      ],
    )
    // Anyone may publish the event: the vote is the authority, not the issuer.
    await decide(dan, {
      subject: applicant,
      action: 'member.activate',
      evidence,
    })
    const [first] = await decisionsFor(applicant)
    expect(first).toBeDefined()
    expect((await authority(applicant)).membershipState).toBe('active')

    // The same vote cannot be spent again.
    await decide(dan, {
      subject: applicant,
      action: 'member.activate',
      evidence,
      version: 2,
      predecessor: first.uri,
    })
    expect(await decisionsFor(applicant)).toHaveLength(1)

    // The view now shows the vote as spent.
    const spent = JSON.parse(
      (
        await network.bsky.ctx.dataplane.getParaCabildeo({
          cabildeoUri: evidence,
          viewerDid: bob,
        })
      ).cabildeoJson,
    )
    expect(spent.assemblyDecision.appliedEvent).toBe(first.uri)
    expect(spent.assemblyDecision.event).toBeUndefined()
  })
})
