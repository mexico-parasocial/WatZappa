import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AtpAgent } from '@atproto/api'
import {
  FROZEN_BALLOT_COLLECTIONS,
  REACTION_COLLECTIONS,
  TID,
} from '@atproto/common'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import { com } from '../src/lexicons.js'

// @NOTE the refusal text lives in @atproto/common; these are the fragments the
// assertions key on, so a reworded message fails here once rather than in a
// dozen places.
const FROZEN = /is frozen and will not be written/
const NOT_A_CABILDEO_BALLOT = /accepted only as a cabildeo ballot/
const PROOF_ON_REACTION = /is a public reaction and must not carry/

const frozenRkey = TID.nextStr()

describe('PARA ballot policy', () => {
  let verifier: Server
  const previousVerifier = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
  const previousDelegationVerifier =
    process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL
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
    verifier = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        const claim = JSON.parse(body)
        const validVote =
          claim.actorDid === did &&
          claim.selectedOption === 1 &&
          claim.voteNullifier === 'a'.repeat(64) &&
          claim.eligibilityProofRef === 'm8:cabildeo:v1:' + 'b'.repeat(43)
        const validDelegation =
          claim.actorDid === did &&
          claim.mode === 'active' &&
          claim.delegateTo === 'did:plc:delegate' &&
          claim.cabildeo === cabildeo &&
          claim.eligibilityProofRef ===
            'm8:delegation:v1:11111111-1111-4111-8111-111111111111:' +
              'a'.repeat(43)
        res.writeHead(validVote || validDelegation ? 204 : 422).end()
      })
    })
    await new Promise<void>((resolve) =>
      verifier.listen(0, '127.0.0.1', resolve),
    )
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = `http://127.0.0.1:${(verifier.address() as AddressInfo).port}/verify`
    process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL =
      process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    network = await TestNetworkNoAppView.create({})
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
    await new Promise<void>((resolve, reject) =>
      verifier?.close((error) => (error ? reject(error) : resolve())),
    )
    if (previousVerifier === undefined)
      delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    else process.env.PARA_CIVIC_VOTE_VERIFIER_URL = previousVerifier
    if (previousDelegationVerifier === undefined)
      delete process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL
    else
      process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL =
        previousDelegationVerifier
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
      voteNullifier: 'a'.repeat(64),
      eligibilityProofRef: 'm8:cabildeo:v1:' + 'b'.repeat(43),
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

    it.each([
      { voteNullifier: undefined },
      { voteNullifier: 'invented' },
      { eligibilityProofRef: undefined },
      { selectedOption: 2 },
      { eligibilityProofRef: 'm8:cabildeo:v1:' + 'c'.repeat(43) },
    ])(
      'rejects unverified direct writes even with schema validation off: %j',
      async (extra) => {
        await expect(
          agent.com.atproto.repo.createRecord({
            repo: did,
            collection: com.para.civic.vote.$type,
            record: cabildeoBallot(extra),
            validate: false,
          }),
        ).rejects.toThrow(/valid cabildeo vote proof/)
      },
    )

    it('rejects unverified votes through putRecord and atomic applyWrites', async () => {
      await expect(
        agent.com.atproto.repo.putRecord({
          repo: did,
          collection: com.para.civic.vote.$type,
          rkey: TID.nextStr(),
          record: cabildeoBallot({ voteNullifier: undefined }),
          validate: false,
        }),
      ).rejects.toThrow(/valid cabildeo vote proof/)
      await expect(
        agent.com.atproto.repo.applyWrites({
          repo: did,
          validate: false,
          writes: [
            {
              $type: 'com.atproto.repo.applyWrites#create',
              collection: com.para.civic.vote.$type,
              value: cabildeoBallot({ voteNullifier: undefined }),
            },
          ],
        }),
      ).rejects.toThrow(/valid cabildeo vote proof/)
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

  it.each([-3, 0, 3])(
    'refuses civic delegation signal %s through all write methods',
    async (signal) => {
      const record = {
        $type: 'com.para.civic.delegation',
        signal,
        createdAt: new Date().toISOString(),
      }
      const collection = 'com.para.civic.delegation'
      await expect(
        agent.com.atproto.repo.createRecord({
          repo: did,
          collection,
          record,
          validate: false,
        }),
      ).rejects.toThrow(/cannot publish a signal/)
      await expect(
        agent.com.atproto.repo.putRecord({
          repo: did,
          collection,
          rkey: TID.nextStr(),
          record,
          validate: false,
        }),
      ).rejects.toThrow(/cannot publish a signal/)
      await expect(
        agent.com.atproto.repo.applyWrites({
          repo: did,
          validate: false,
          writes: [
            {
              $type: 'com.atproto.repo.applyWrites#create',
              collection,
              value: record,
            },
          ],
        }),
      ).rejects.toThrow(/cannot publish a signal/)
    },
  )

  it('writes a verified public delegation and refuses changed claims', async () => {
    const record = {
      $type: 'com.para.civic.delegation',
      mode: 'active',
      cabildeo,
      delegateTo: 'did:plc:delegate',
      eligibilityProofRef:
        'm8:delegation:v1:11111111-1111-4111-8111-111111111111:' +
        'a'.repeat(43),
      createdAt: new Date().toISOString(),
    }
    const accepted = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: record.$type,
      record,
    })
    expect(accepted.data.uri).toContain(record.$type)
    for (const change of [
      { delegateTo: 'did:plc:other' },
      { eligibilityProofRef: undefined },
      { eligibilityProofRef: 'invented' },
    ]) {
      await expect(
        agent.com.atproto.repo.createRecord({
          repo: did,
          collection: record.$type,
          record: { ...record, ...change },
          validate: false,
        }),
      ).rejects.toThrow(/valid civic delegation proof/)
    }
  })

  describe('box 1: a -3..+3 answer and a dead stance record are frozen', () => {
    const records = (): Record<string, Record<string, unknown>> => ({
      'com.para.raq.proposalAnswer': {
        $type: 'com.para.raq.proposalAnswer',
        subject: proposal,
        value: 3,
        createdAt: new Date().toISOString(),
      },
      'com.para.community.civicTreeVote': {
        $type: 'com.para.community.civicTreeVote',
        civicTree: proposal,
        voter: did,
        direction: 'agree',
        createdAt: new Date().toISOString(),
      },
    })

    it.each([
      'com.para.raq.proposalAnswer',
      'com.para.community.civicTreeVote',
    ])(
      'refuses to create a %s, with or without validation',
      async (collection) => {
        const record = records()[collection]
        for (const validate of [true, false]) {
          await expect(
            agent.com.atproto.repo.createRecord({
              repo: did,
              collection,
              record,
              validate,
            }),
          ).rejects.toThrow(FROZEN)
        }
      },
    )

    it('names the -3..+3 value as the reason for proposalAnswer', async () => {
      await expect(
        agent.com.atproto.repo.createRecord({
          repo: did,
          collection: 'com.para.raq.proposalAnswer',
          record: records()['com.para.raq.proposalAnswer'],
        }),
      ).rejects.toThrow(/signal under another name/)
    })
  })

  describe('box 3: reactions are written without an m8 proof', () => {
    const reactions = (): Record<string, Record<string, unknown>> => ({
      'com.para.civic.openQuestionVote': {
        $type: 'com.para.civic.openQuestionVote',
        subject: proposal,
        value: 1,
        createdAt: new Date().toISOString(),
      },
      'com.para.raq.proposalVote': {
        $type: 'com.para.raq.proposalVote',
        subject: proposal,
        value: -1,
        createdAt: new Date().toISOString(),
      },
      'com.para.raq.axisVote': {
        $type: 'com.para.raq.axisVote',
        axisId: 'community-axis-1',
        value: 1,
        createdAt: new Date().toISOString(),
      },
    })

    it.each([
      'com.para.civic.openQuestionVote',
      'com.para.raq.proposalVote',
      'com.para.raq.axisVote',
    ])('writes a %s that carries no proof', async (collection) => {
      const { data } = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection,
        record: reactions()[collection],
      })
      expect(data.uri).toContain(collection)
    })

    it.each([
      ['com.para.civic.openQuestionVote', 'voteNullifier'],
      ['com.para.raq.proposalVote', 'eligibilityProofRef'],
      ['com.para.raq.axisVote', 'voteNullifier'],
    ])(
      'refuses a %s carrying %s, even with validation disabled',
      async (collection, field) => {
        const record = { ...reactions()[collection], [field]: 'a'.repeat(64) }
        for (const validate of [true, false]) {
          await expect(
            agent.com.atproto.repo.createRecord({
              repo: did,
              collection,
              record,
              validate,
            }),
          ).rejects.toThrow(PROOF_ON_REACTION)
        }
      },
    )

    it('refuses a proof-carrying reaction inside applyWrites, writing nothing', async () => {
      const before = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'com.para.raq.axisVote',
      })
      await expect(
        agent.com.atproto.repo.applyWrites({
          repo: did,
          writes: [
            {
              $type: 'com.atproto.repo.applyWrites#create',
              collection: 'com.para.raq.axisVote',
              value: reactions()['com.para.raq.axisVote'],
            },
            {
              $type: 'com.atproto.repo.applyWrites#create',
              collection: 'com.para.raq.axisVote',
              value: {
                ...reactions()['com.para.raq.axisVote'],
                voteNullifier: 'a'.repeat(64),
              },
            },
          ],
        }),
      ).rejects.toThrow(PROOF_ON_REACTION)
      const after = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'com.para.raq.axisVote',
      })
      expect(after.data.records.length).toBe(before.data.records.length)
    })
  })

  it('names collections that the lexicons still define', () => {
    // The policy lists are written as string literals because @atproto/common
    // has no lexicon codegen. This is what stops a rename from silently thawing
    // one, or silently letting a reaction ask m8 again.
    expect([...FROZEN_BALLOT_COLLECTIONS].sort()).toEqual(
      [
        com.para.community.intensity.$type,
        com.para.community.vote.$type,
        com.para.raq.proposalAnswer.$type,
        com.para.community.civicTreeVote.$type,
      ].sort(),
    )
    expect([...REACTION_COLLECTIONS].sort()).toEqual(
      [
        com.para.civic.openQuestionVote.$type,
        com.para.raq.proposalVote.$type,
        com.para.raq.axisVote.$type,
      ].sort(),
    )
  })
})
