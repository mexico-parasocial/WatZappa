import type { AtpAgent } from '@atproto/api'
import { FROZEN_BALLOT_COLLECTIONS, TID } from '@atproto/common'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import { com } from '../src/lexicons.js'

// @NOTE the refusal text lives in @atproto/common; these are the fragments the
// assertions key on, so a reworded message fails here once rather than in a
// dozen places.
const FROZEN = /is frozen and will not be written/
const NOT_A_CABILDEO_BALLOT = /accepted only as a cabildeo ballot/

const frozenRkey = TID.nextStr()

describe('PARA ballot policy', () => {
  let network: TestNetworkNoAppView
  let agent: AtpAgent
  let did: string
  let proposal: string
  let community: string
  let cabildeo: string

  const voteRecord = () => ({
    $type: 'com.para.community.vote',
    proposal,
    community,
    voter: did,
    signal: 2,
    createdAt: new Date().toISOString(),
  })

  const intensityRecord = () => ({
    $type: 'com.para.community.intensity',
    proposal,
    voter: did,
    signal: 2,
    units: 4,
    createdAt: new Date().toISOString(),
  })

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'ballot_freeze',
    })
    agent = network.pds.getAgent()
    const { data } = await agent.createAccount({
      email: 'voter@test.com',
      handle: 'voter.test',
      password: 'voter-pass',
    })
    did = data.did
    proposal = `at://${did}/com.para.community.proposal/${TID.nextStr()}`
    community = `at://${did}/com.para.community.board/${TID.nextStr()}`
    cabildeo = `at://${did}/com.para.civic.cabildeo/${TID.nextStr()}`
  })

  afterAll(async () => {
    await network?.close()
  })

  it('refuses to create a com.para.community.vote', async () => {
    const attempt = agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'com.para.community.vote',
      record: voteRecord(),
    })
    await expect(attempt).rejects.toThrow(FROZEN)
  })

  it('refuses to create a com.para.community.intensity', async () => {
    const attempt = agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'com.para.community.intensity',
      record: intensityRecord(),
    })
    await expect(attempt).rejects.toThrow(FROZEN)
  })

  it('refuses a frozen write with validation disabled', async () => {
    // `validate: false` waives schema checking. The freeze is not schema
    // checking, so it still applies — this is the bypass worth pinning.
    const attempt = agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'com.para.community.vote',
      record: voteRecord(),
      validate: false,
    })
    await expect(attempt).rejects.toThrow(FROZEN)
  })

  it('refuses a frozen write through putRecord', async () => {
    const attempt = agent.com.atproto.repo.putRecord({
      repo: did,
      collection: 'com.para.community.vote',
      rkey: frozenRkey,
      record: voteRecord(),
    })
    await expect(attempt).rejects.toThrow(FROZEN)
  })

  it('refuses a frozen write through applyWrites, writing nothing', async () => {
    const attempt = agent.com.atproto.repo.applyWrites({
      repo: did,
      writes: [
        {
          $type: 'com.atproto.repo.applyWrites#create',
          collection: 'com.para.community.vote',
          value: voteRecord(),
        },
      ],
    })
    await expect(attempt).rejects.toThrow(FROZEN)

    const { data } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: 'com.para.community.vote',
    })
    expect(data.records).toHaveLength(0)
  })

  it('does not freeze deletes', async () => {
    // A freeze that stopped people removing ballots they already published
    // would invert the decision it implements. Nothing exists to delete here,
    // which the PDS treats as a no-op — what matters is that it is not refused.
    const attempt = agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: 'com.para.community.vote',
      rkey: frozenRkey,
    })
    await expect(attempt).resolves.toBeDefined()
  })

  it('leaves collections outside the freeze writable', async () => {
    const { data } = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'com.para.community.delegation',
      record: {
        $type: 'com.para.community.delegation',
        delegate: did,
        delegator: did,
        scope: { mode: 'community', community },
        createdAt: new Date().toISOString(),
      },
    })
    expect(data.uri).toContain('com.para.community.delegation')
  })

  describe('com.para.civic.vote is narrowed to cabildeo ballots', () => {
    // Not frozen: a cabildeo ballot is public and attributable, and that has
    // been accepted for cabildeo votes and only for those (OD-7 §5c). The
    // shapes refused below are the ones that would publish a -3..+3 position or
    // the delegation graph in the voter's own repo.
    const cabildeoBallot = (extra: Record<string, unknown> = {}) => ({
      $type: com.para.civic.vote.$type,
      subject: cabildeo,
      subjectType: 'cabildeo',
      cabildeo,
      selectedOption: 1,
      isDirect: true,
      createdAt: new Date().toISOString(),
      ...extra,
    })

    it('accepts a cabildeo ballot', async () => {
      const { data } = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: com.para.civic.vote.$type,
        record: cabildeoBallot(),
      })
      expect(data.uri).toContain(com.para.civic.vote.$type)
    })

    it('refuses a policy ballot', async () => {
      const attempt = agent.com.atproto.repo.createRecord({
        repo: did,
        collection: com.para.civic.vote.$type,
        record: cabildeoBallot({
          subjectType: 'policy',
          selectedOption: undefined,
          signal: 2,
        }),
      })
      await expect(attempt).rejects.toThrow(NOT_A_CABILDEO_BALLOT)
    })

    it('refuses a cabildeo ballot carrying a signal', async () => {
      const attempt = agent.com.atproto.repo.createRecord({
        repo: did,
        collection: com.para.civic.vote.$type,
        record: cabildeoBallot({ signal: -3 }),
      })
      await expect(attempt).rejects.toThrow(NOT_A_CABILDEO_BALLOT)
    })

    it('refuses a ballot naming delegators', async () => {
      const attempt = agent.com.atproto.repo.createRecord({
        repo: did,
        collection: com.para.civic.vote.$type,
        record: cabildeoBallot({ delegatedFrom: [did], isDirect: false }),
      })
      await expect(attempt).rejects.toThrow(NOT_A_CABILDEO_BALLOT)
    })

    it('refuses a ballot with no subject type at all', async () => {
      const attempt = agent.com.atproto.repo.createRecord({
        repo: did,
        collection: com.para.civic.vote.$type,
        record: cabildeoBallot({ subjectType: undefined }),
      })
      await expect(attempt).rejects.toThrow(NOT_A_CABILDEO_BALLOT)
    })
  })

  it('names collections that the lexicons still define', () => {
    // The freeze list is written as string literals because @atproto/common has
    // no lexicon codegen. This is what stops a rename from silently thawing one.
    expect([...FROZEN_BALLOT_COLLECTIONS].sort()).toEqual(
      [
        com.para.community.intensity.$type,
        com.para.community.vote.$type,
      ].sort(),
    )
  })
})
