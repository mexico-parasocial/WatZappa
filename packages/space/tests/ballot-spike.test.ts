/*
 * SPIKE (OD-8 §8, 2026-10-31). Throwaway: models a space-backed ballot round
 * trip in memory with the real @atproto/space primitives and the real PARA
 * write gate, to measure what a PDS, a space authority and a syncer would each
 * have to implement. No HTTP between the actors; only the m8 verifier is a real
 * server. Findings are recorded in docs/OD-8-SPACE-BALLOTS.md §9.
 */
import { createHash, createHmac } from 'node:crypto'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TID, ballotWritePolicyRefusal } from '@atproto/common'
import { type Keypair, Secp256k1Keypair } from '@atproto/crypto'
import type { Key } from '@atproto/jwk'
import { JoseKey } from '@atproto/jwk-jose'
import {
  RepoCommit,
  type SerializedRecord,
  type SignedCommit,
  createDpopProof,
  createSpaceToken,
  dpopJktForKey,
  serializeRecord,
  serializeRepo,
  spaceHostAud,
  verifyDpopProof,
  verifyRepoCarFull,
  verifySpaceToken,
} from '../src/index.js'

const AUTHORITY = 'did:web:para.example'
const SPACE = `at://${AUTHORITY}/space/com.para.civic.election/${TID.nextStr()}`
const CABILDEO = 'at://did:plc:board/com.para.civic.cabildeo/one'
const BALLOT = 'com.para.civic.vote'
const FLOOR = 3
const HOST_URL = 'https://pds.example/xrpc/com.atproto.space.getRepo'

const concat = (b: Uint8Array[]) => Buffer.concat(b)

/** The m8 stand-in: authorizes (actor, subject, option, nullifier) by MAC. */
const M8_KEY = 'spike-m8-key'
const nullifierFor = (did: string) =>
  createHash('sha256').update(`null|${did}|${CABILDEO}`).digest('hex')
const proofRef = (did: string, option: number, nullifier: string) =>
  'm8:cabildeo:v1:' +
  createHmac('sha256', M8_KEY)
    .update([did, CABILDEO, option, nullifier].join('|'))
    .digest('base64url')
    .slice(0, 43)

const ballot = (did: string, option: number) => {
  const voteNullifier = nullifierFor(did)
  return {
    subjectType: 'cabildeo',
    subject: CABILDEO,
    cabildeo: CABILDEO,
    selectedOption: option,
    isDirect: true,
    voteNullifier,
    eligibilityProofRef: proofRef(did, option, voteNullifier),
    createdAt: '2026-10-31T00:00:00.000Z',
  }
}

type Voter = { did: string; keypair: Keypair }

/** What a PDS must do for a space: store records and commit state, gate writes. */
class RepoHost {
  private repos = new Map<
    string,
    { commit: RepoCommit; records: Map<string, SerializedRecord>; rev: string }
  >()
  private seenProofs = new Set<string>()
  notifications: { repo: string; rev: string }[] = []

  constructor(private authorityKey: string) {}

  async createRecord(
    voter: Voter,
    collection: string,
    rkey: string,
    record: Record<string, unknown>,
  ) {
    // The one line that matters for OD-8: space writes use the same gate.
    const refusal = await ballotWritePolicyRefusal(
      voter.did,
      collection,
      record,
    )
    if (refusal) throw new Error(refusal)

    const repo = this.repos.get(voter.did) ?? {
      commit: new RepoCommit(),
      records: new Map(),
      rev: '',
    }
    const path = `${collection}/${rkey}`
    const next = await serializeRecord(collection, rkey, record as never)
    repo.commit.applyOp({
      collection,
      rkey,
      cid: next.cid,
      prev: repo.records.get(path)?.cid ?? null,
    })
    repo.records.set(path, next)
    repo.rev = TID.nextStr()
    this.repos.set(voter.did, repo)
    this.notifications.push({ repo: voter.did, rev: repo.rev })
  }

  async deleteRecord(voter: Voter, collection: string, rkey: string) {
    const repo = this.repos.get(voter.did)!
    const path = `${collection}/${rkey}`
    const prev = repo.records.get(path)!
    repo.commit.applyOp({ collection, rkey, cid: null, prev: prev.cid })
    repo.records.delete(path)
    repo.rev = TID.nextStr()
    this.notifications.push({ repo: voter.did, rev: repo.rev })
  }

  /** Test hook: change stored bytes without touching the commit. */
  tamper(did: string, path: string, record: Record<string, unknown>) {
    const [collection, rkey] = path.split('/')
    return serializeRecord(collection, rkey, record as never).then((s) => {
      this.repos.get(did)!.records.set(path, s)
    })
  }

  async getRepo(
    did: string,
    voterKeypair: Keypair,
    credential: string,
    dpop: string,
  ): Promise<Uint8Array> {
    const { payload } = await verifySpaceToken('credential', credential, {
      sub: SPACE,
      getSigningKey: () => this.authorityKey,
    })
    const proof = await verifyDpopProof(dpop, {
      htm: 'GET',
      htu: HOST_URL,
      credential,
      jkt: payload.cnf!.jkt,
    })
    if (this.seenProofs.has(proof.jti)) throw new Error('DPoP replay')
    this.seenProofs.add(proof.jti)

    const repo = this.repos.get(did)!
    const commit: SignedCommit = await repo.commit.sign(
      { space: SPACE, author: did, rev: repo.rev },
      voterKeypair,
    )
    const chunks: Uint8Array[] = []
    for await (const chunk of serializeRepo(commit, repo.records.values())) {
      chunks.push(chunk)
    }
    return concat(chunks)
  }
}

/** What the authority must do: mint credentials, keep the writer set. */
class Authority {
  private spentDelegations = new Set<string>()
  writers = new Set<string>()

  constructor(
    readonly keypair: Keypair,
    private keys: Map<string, Keypair>,
    private eligible: Set<string>,
  ) {}

  async getSpaceCredential(delegation: string, dpopJkt: string) {
    const { payload } = await verifySpaceToken('delegation', delegation, {
      aud: spaceHostAud(AUTHORITY),
      sub: SPACE,
      getSigningKey: (iss) => this.keys.get(iss)!.did(),
    })
    if (this.spentDelegations.has(payload.jti)) throw new Error('replayed jti')
    this.spentDelegations.add(payload.jti)
    // The managing-app check (`checkUserAccess`): PARA decides eligibility.
    if (!this.eligible.has(payload.iss)) throw new Error('not eligible')
    return createSpaceToken(
      'credential',
      { iss: AUTHORITY, sub: SPACE, dpopJkt, expiresInSec: 600 },
      this.keypair,
    )
  }
}

type Tally =
  | { published: false; reason: string }
  | { published: true; counts: Record<number, number>; ballots: number }

/** What the AppView must do: fetch, verify, re-gate, dedupe, tally, withhold. */
class Syncer {
  skipped: string[] = []
  gateCalls = 0

  constructor(
    private did: string,
    private keypair: Keypair,
    private authority: Authority,
    private host: RepoHost,
    private dpopKey: Key,
  ) {}

  async sync(voters: Voter[], closed: boolean): Promise<Tally> {
    const delegation = await createSpaceToken(
      'delegation',
      { iss: this.did, sub: SPACE, aud: spaceHostAud(AUTHORITY) },
      this.keypair,
    )
    const credential = await this.authority.getSpaceCredential(
      delegation,
      await dpopJktForKey(this.dpopKey),
    )

    const byNullifier = new Map<string, number>()
    for (const voter of voters) {
      if (!this.authority.writers.has(voter.did)) continue
      const dpop = await createDpopProof(this.dpopKey, {
        htm: 'GET',
        htu: HOST_URL,
        credential,
      })
      const car = await this.host.getRepo(
        voter.did,
        voter.keypair,
        credential,
        dpop,
      )
      const repo = await verifyRepoCarFull([car], {
        space: SPACE,
        author: voter.did,
        didKey: voter.keypair.did(),
      })
      for (const { collection, rkey, record } of repo.records) {
        this.gateCalls++
        const refusal = await ballotWritePolicyRefusal(
          voter.did,
          collection,
          record,
        )
        if (refusal) {
          this.skipped.push(`${voter.did}/${collection}/${rkey}`)
          continue
        }
        const r = record as { voteNullifier: string; selectedOption: number }
        byNullifier.set(r.voteNullifier, r.selectedOption)
      }
    }

    if (!closed) return { published: false, reason: 'election still open' }
    if (byNullifier.size < FLOOR) {
      return { published: false, reason: `fewer than ${FLOOR} ballots` }
    }
    const counts: Record<number, number> = {}
    for (const option of byNullifier.values()) {
      counts[option] = (counts[option] ?? 0) + 1
    }
    return { published: true, counts, ballots: byNullifier.size }
  }
}

describe('space ballot round trip (spike)', () => {
  let m8: Server
  let host: RepoHost
  let authority: Authority
  let syncer: Syncer
  let voters: Voter[]
  let keys: Map<string, Keypair>
  let tallyKeypair: Keypair
  const previous = process.env.PARA_CIVIC_VOTE_VERIFIER_URL

  beforeAll(async () => {
    m8 = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const c = JSON.parse(body)
        const ok =
          c.eligibilityProofRef ===
          proofRef(c.actorDid, c.selectedOption, c.voteNullifier)
        res.writeHead(ok ? 204 : 422).end()
      })
    })
    await new Promise<void>((r) => m8.listen(0, '127.0.0.1', r))
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = `http://127.0.0.1:${(m8.address() as AddressInfo).port}/verify`

    keys = new Map()
    voters = []
    for (let i = 1; i <= 5; i++) {
      const voter = {
        did: `did:plc:voter${i}`,
        keypair: await Secp256k1Keypair.create(),
      }
      keys.set(voter.did, voter.keypair)
      voters.push(voter)
    }
    const authorityKeypair = await Secp256k1Keypair.create()
    tallyKeypair = await Secp256k1Keypair.create()
    keys.set('did:plc:tally', tallyKeypair)

    host = new RepoHost(authorityKeypair.did())
    authority = new Authority(
      authorityKeypair,
      keys,
      new Set(['did:plc:tally']),
    )
    syncer = new Syncer(
      'did:plc:tally',
      tallyKeypair,
      authority,
      host,
      await JoseKey.generate(['ES256']),
    )
  })
  afterAll(async () => {
    if (previous === undefined) delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    else process.env.PARA_CIVIC_VOTE_VERIFIER_URL = previous
    m8.closeAllConnections()
    await new Promise((r) => m8.close(r))
  })

  const cast = async (voter: Voter, option: number, rkey = 'vote') => {
    await host.createRecord(voter, BALLOT, rkey, ballot(voter.did, option))
    authority.writers.add(voter.did) // notifyWrite → writer set
  }

  it('refuses frozen and malformed ballots at the space write path', async () => {
    const [v] = voters
    await expect(
      host.createRecord(v, 'com.para.community.vote', 'x', {
        voter: v.did,
        signal: 2,
      }),
    ).rejects.toThrow(/is frozen/)
    await expect(
      host.createRecord(v, BALLOT, 'x', {
        ...ballot(v.did, 1),
        delegatedFrom: ['did:plc:other'],
      }),
    ).rejects.toThrow(/accepted only as a cabildeo or policy ballot/)
    await expect(
      host.createRecord(v, BALLOT, 'x', {
        ...ballot(v.did, 1),
        selectedOption: 2, // rewritten after the proof was issued
      }),
    ).rejects.toThrow(/valid civic vote proof is required/)
  })

  it('fails closed when m8 is unreachable', async () => {
    const saved = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    try {
      await expect(
        host.createRecord(voters[0], BALLOT, 'x', ballot(voters[0].did, 1)),
      ).rejects.toThrow(/verification is unavailable/)
    } finally {
      process.env.PARA_CIVIC_VOTE_VERIFIER_URL = saved
    }
  })

  it('withholds the tally while open and below the floor', async () => {
    await cast(voters[0], 1)
    await cast(voters[1], 0)
    expect(await syncer.sync(voters, false)).toEqual({
      published: false,
      reason: 'election still open',
    })
    expect(await syncer.sync(voters, true)).toEqual({
      published: false,
      reason: `fewer than ${FLOOR} ballots`,
    })
  })

  it('tallies verified ballots from every writer once the floor is met', async () => {
    await cast(voters[2], 1)
    await cast(voters[3], 1)
    await cast(voters[4], 0)
    const before = syncer.gateCalls
    expect(await syncer.sync(voters, true)).toEqual({
      published: true,
      counts: { 0: 2, 1: 3 },
      ballots: 5,
    })
    // Cost: every sync re-asks m8 about every ballot, once per ballot.
    expect(syncer.gateCalls - before).toBe(5)
  })

  it('counts a recast once, by nullifier, and honors a delete', async () => {
    await cast(voters[0], 0, 'vote2') // second record, same nullifier
    const tally = await syncer.sync(voters, true)
    expect(tally).toMatchObject({ published: true, ballots: 5 })

    await host.deleteRecord(voters[0], BALLOT, 'vote')
    await host.deleteRecord(voters[0], BALLOT, 'vote2')
    expect(await syncer.sync(voters, true)).toMatchObject({
      published: true,
      ballots: 4,
    })
  })

  it('drops a record a host altered after the proof was issued', async () => {
    syncer.skipped.length = 0
    const v = voters[1]
    await host.tamper(v.did, `${BALLOT}/vote`, ballot(v.did, 1)) // flips 0 → 1
    // The bytes no longer match the committed set hash, so the CAR is rejected
    // outright: the syncer cannot even read this repo.
    await expect(syncer.sync(voters, true)).rejects.toThrow(
      /index does not match the commit hash|expected block/,
    )
  })

  it('rejects a credential presented with the wrong DPoP key or for another space', async () => {
    const other = await JoseKey.generate(['ES256'])
    const bound = await JoseKey.generate(['ES256'])
    const credential = await createSpaceToken(
      'credential',
      { iss: AUTHORITY, sub: SPACE, dpopJkt: await dpopJktForKey(bound) },
      (authority as unknown as { keypair: Keypair }).keypair,
    )
    const stolen = await createDpopProof(other, {
      htm: 'GET',
      htu: HOST_URL,
      credential,
    })
    await expect(
      host.getRepo(voters[2].did, voters[2].keypair, credential, stolen),
    ).rejects.toThrow(/not signed by the key the credential is bound to/)

    const elsewhere = await createSpaceToken(
      'credential',
      {
        iss: AUTHORITY,
        sub: `${SPACE}x`,
        dpopJkt: await dpopJktForKey(bound),
      },
      (authority as unknown as { keypair: Keypair }).keypair,
    )
    const proof = await createDpopProof(bound, {
      htm: 'GET',
      htu: HOST_URL,
      credential: elsewhere,
    })
    await expect(
      host.getRepo(voters[2].did, voters[2].keypair, elsewhere, proof),
    ).rejects.toThrow(/does not match the requested space/)
  })

  it('refuses a replayed DPoP proof', async () => {
    const key = await JoseKey.generate(['ES256'])
    const delegation = await createSpaceToken(
      'delegation',
      { iss: 'did:plc:tally', sub: SPACE, aud: spaceHostAud(AUTHORITY) },
      tallyKeypair,
    )
    const credential = await authority.getSpaceCredential(
      delegation,
      await dpopJktForKey(key),
    )
    const proof = await createDpopProof(key, {
      htm: 'GET',
      htu: HOST_URL,
      credential,
    })
    const v = voters[2]
    await host.getRepo(v.did, v.keypair, credential, proof)
    await expect(
      host.getRepo(v.did, v.keypair, credential, proof),
    ).rejects.toThrow(/DPoP replay/)

    // and an ineligible requester gets no credential at all
    const stranger = await Secp256k1Keypair.create()
    keys.set('did:plc:stranger', stranger)
    const strangerToken = await createSpaceToken(
      'delegation',
      { iss: 'did:plc:stranger', sub: SPACE, aud: spaceHostAud(AUTHORITY) },
      stranger,
    )
    await expect(
      authority.getSpaceCredential(strangerToken, await dpopJktForKey(key)),
    ).rejects.toThrow(/not eligible/)
  })

  it('leaves a ballot checkable by anyone with the m8 verifier (not deniable)', async () => {
    const leaked = ballot(voters[3].did, 1)
    await expect(
      ballotWritePolicyRefusal(voters[3].did, BALLOT, leaked),
    ).resolves.toBeUndefined()
    // ...and bound to the right actor: the same record fails for another DID.
    await expect(
      ballotWritePolicyRefusal(voters[4].did, BALLOT, leaked),
    ).resolves.toMatch(/valid civic vote proof is required/)
  })
})
