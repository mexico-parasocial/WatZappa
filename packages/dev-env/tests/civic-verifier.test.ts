import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DevCivicVerifier,
  devCabildeoVoteProof,
  devDelegationProof,
  devVoteNullifier,
} from '../src/civic-verifier.js'

const actorDid = 'did:plc:voter'
const cabildeo = 'at://did:plc:board/com.para.civic.cabildeo/one'

describe('DevCivicVerifier', () => {
  const previous = {
    vote: process.env.PARA_CIVIC_VOTE_VERIFIER_URL,
    delegation: process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL,
    secret: process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET,
  }
  let upstream: Server
  let upstreamCalls: Array<{ path?: string; secret?: string; body: unknown }>
  let verifier: DevCivicVerifier

  const post = (body: unknown, secret?: string) =>
    fetch(verifier.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-m8-resolver-secret': secret } : {}),
      },
      body: JSON.stringify(body),
    })

  beforeAll(async () => {
    delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    delete process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET
    upstreamCalls = []
    // Stands in for mubEZ: accepts only the proof "m8:cabildeo:v1:" + 'u' x43.
    upstream = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        const body = JSON.parse(raw)
        upstreamCalls.push({
          path: req.url,
          secret: req.headers['x-m8-resolver-secret'] as string | undefined,
          body,
        })
        res.writeHead(
          body.eligibilityProofRef === 'm8:cabildeo:v1:' + 'u'.repeat(43)
            ? 204
            : 422,
        )
        res.end()
      })
    })
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    )
    const port = (upstream.address() as AddressInfo).port
    verifier = (await DevCivicVerifier.startIfUnconfigured({
      upstreamUrl: `http://127.0.0.1:${port}/v1`,
      upstreamResolverSecret: 'upstream-secret',
    }))!
  })

  afterAll(async () => {
    await verifier?.close()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
    expect(process.env.PARA_CIVIC_VOTE_VERIFIER_URL).toBe(previous.vote)
    expect(process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL).toBe(
      previous.delegation,
    )
  })

  it('points the PDS and AppView at itself', () => {
    expect(process.env.PARA_CIVIC_VOTE_VERIFIER_URL).toBe(verifier.url)
    expect(process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL).toBe(verifier.url)
    expect(process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET).toBeTruthy()
  })

  it('does not replace a verifier someone already configured', async () => {
    expect(await DevCivicVerifier.startIfUnconfigured()).toBeUndefined()
  })

  it('accepts a vote proof it minted and refuses an altered one', async () => {
    const proof = devCabildeoVoteProof(actorDid, cabildeo, 1)
    const claim = { actorDid, subjectUri: cabildeo, selectedOption: 1, ...proof }
    expect((await post(claim)).status).toBe(204)
    expect((await post({ ...claim, selectedOption: 0 })).status).toBe(422)
  })

  it('forwards a proof it did not mint to the real m8', async () => {
    const claim = {
      actorDid,
      subjectUri: cabildeo,
      selectedOption: 1,
      voteNullifier: 'a'.repeat(64),
      eligibilityProofRef: 'm8:cabildeo:v1:' + 'u'.repeat(43),
    }
    expect((await post(claim)).status).toBe(204)
    expect(upstreamCalls.at(-1)?.path).toBe(
      '/v1/identity/civic-vote-proof/verify',
    )
  })

  it('verifies and resolves a delegation grant it minted', async () => {
    const claim = { mode: 'active' as const, delegateTo: 'did:plc:rep', cabildeo }
    const body = {
      actorDid,
      ...claim,
      eligibilityProofRef: devDelegationProof(actorDid, claim),
    }
    expect((await post(body)).status).toBe(204)
    expect((await post({ ...body, delegateTo: 'did:plc:other' })).status).toBe(
      422,
    )

    // Resolution needs the resolver secret, like m8.
    expect((await post({ ...body, subjectUri: cabildeo })).status).toBe(403)
    const resolved = await post(
      { ...body, subjectUri: cabildeo },
      process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET,
    )
    expect(resolved.status).toBe(200)
    expect(await resolved.json()).toEqual({
      voteNullifier: devVoteNullifier(actorDid, cabildeo),
    })
  })

  it('forwards a foreign delegation with the upstream resolver secret', async () => {
    const body = {
      actorDid,
      mode: 'active',
      delegateTo: 'did:plc:rep',
      cabildeo,
      subjectUri: cabildeo,
      eligibilityProofRef: `m8:delegation:v1:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}:${'x'.repeat(43)}`,
    }
    await post(body, process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET)
    expect(upstreamCalls.at(-1)).toMatchObject({
      path: '/v1/identity/civic-delegation-proof/verify',
      secret: 'upstream-secret',
    })
  })
})
