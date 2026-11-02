import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ballotWritePolicyRefusal } from './para-ballot-policy.js'

const did = 'did:plc:example'
const cabildeoBallot = {
  subjectType: 'cabildeo',
  subject: 'at://did:plc:board/com.para.civic.cabildeo/one',
  cabildeo: 'at://did:plc:board/com.para.civic.cabildeo/one',
  selectedOption: 1,
  isDirect: true,
  voteNullifier: 'a'.repeat(64),
  eligibilityProofRef: 'm8:cabildeo:v1:' + 'b'.repeat(43),
}

let server: Server
let verifierStatus: number
let requests = 0
const previous = {
  vote: process.env.PARA_CIVIC_VOTE_VERIFIER_URL,
  delegation: process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL,
}

beforeAll(async () => {
  server = createServer((req, res) => {
    requests++
    req.resume()
    req.on('end', () => res.writeHead(verifierStatus).end())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})
beforeEach(() => {
  verifierStatus = 204
  requests = 0
  process.env.PARA_CIVIC_VOTE_VERIFIER_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/verify`
  delete process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL
})
afterAll(async () => {
  restore('PARA_CIVIC_VOTE_VERIFIER_URL', previous.vote)
  restore('PARA_CIVIC_DELEGATION_VERIFIER_URL', previous.delegation)
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('ballot write policy', () => {
  it('allows a verified cabildeo ballot', async () => {
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.civic.vote', cabildeoBallot),
    ).resolves.toBeUndefined()
    expect(requests).toBe(1)
  })

  it('refuses a frozen collection without asking the verifier', async () => {
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.community.vote', {
        voter: did,
        signal: 2,
      }),
    ).resolves.toMatch(/is frozen and will not be written/)
    expect(requests).toBe(0)
  })

  it.each([
    ['a delegatedFrom list', { delegatedFrom: ['did:plc:other'] }],
    ['a signal on a cabildeo ballot', { signal: 2 }],
    ['an unknown subject type', { subjectType: 'proposal' }],
  ])('refuses %s before the verifier is asked', async (_name, change) => {
    const refusal = await ballotWritePolicyRefusal(did, 'com.para.civic.vote', {
      ...cabildeoBallot,
      ...change,
    })
    expect(refusal).toMatch(/accepted only as a cabildeo or policy ballot/)
    expect(requests).toBe(0)
  })

  it('refuses a ballot the verifier rejects', async () => {
    verifierStatus = 422
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.civic.vote', cabildeoBallot),
    ).resolves.toBe('A valid civic vote proof is required')
  })

  it('fails closed when the verifier is unavailable', async () => {
    verifierStatus = 500
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.civic.vote', cabildeoBallot),
    ).resolves.toBe(
      'Civic vote verification is unavailable; no vote was written',
    )
  })

  it('fails closed when no verifier is configured', async () => {
    delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.civic.vote', cabildeoBallot),
    ).resolves.toBe(
      'Civic vote verification is unavailable; no vote was written',
    )
  })

  it('refuses a malformed delegation', async () => {
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.civic.delegation', {
        delegateTo: 'did:plc:other',
      }),
    ).resolves.toBe('A valid civic delegation proof is required')
  })

  it('fails closed on a delegation when no verifier is configured', async () => {
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.civic.delegation', {
        mode: 'active',
        delegateTo: 'did:plc:other',
        cabildeo: cabildeoBallot.cabildeo,
        eligibilityProofRef: `m8:delegation:v1:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}:${'c'.repeat(43)}`,
      }),
    ).resolves.toBe(
      'Civic delegation verification is unavailable; no delegation was written',
    )
  })

  it('refuses a proof field on a public reaction', async () => {
    await expect(
      ballotWritePolicyRefusal(did, 'com.para.raq.proposalVote', {
        voteNullifier: 'a'.repeat(64),
      }),
    ).resolves.toMatch(/is a public reaction and must not carry/)
  })

  it('leaves other collections alone', async () => {
    await expect(
      ballotWritePolicyRefusal(did, 'app.bsky.feed.post', { text: 'hi' }),
    ).resolves.toBeUndefined()
    expect(requests).toBe(0)
  })
})
