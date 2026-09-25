import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import events from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

/*
 * Dev-env stand-in for m8's civic verification endpoints, so seeds and tests
 * can write cabildeo votes and delegations without a running m8 broker.
 *
 * - Proofs minted by `devCabildeoVoteProof` / `devDelegationProof` are
 *   verified here. They are signed with a key that only exists in this file,
 *   so nothing outside dev-env accepts them.
 * - Anything else is forwarded to the real m8 broker when `upstreamUrl` is set
 *   (e.g. the local mubEZ on :8787), so an app talking to a real m8 keeps
 *   working against the same dev-env.
 *
 * The PDS and AppView find this server through PARA_CIVIC_VOTE_VERIFIER_URL
 * and PARA_CIVIC_DELEGATION_VERIFIER_URL, exactly as they would find m8.
 */

const DEV_PROOF_KEY = 'para-dev-env-civic-proof'

const devMac = (parts: unknown[]) =>
  createHmac('sha256', DEV_PROOF_KEY)
    .update(JSON.stringify(parts))
    .digest('base64url')

export type DevDelegationClaim =
  | { mode: 'active'; delegateTo: string; cabildeo: string }
  | {
      mode: 'passive'
      delegateTo: string
      party: string
      community: string
      scopeFlairs: string[]
    }

const canonicalClaim = (claim: DevDelegationClaim) =>
  claim.mode === 'active'
    ? ['active', claim.delegateTo.trim(), claim.cabildeo]
    : [
        'passive',
        claim.delegateTo.trim(),
        claim.party.trim(),
        claim.community.trim(),
        [...new Set(claim.scopeFlairs.map((f) => f.trim()).filter(Boolean))]
          .sort(),
      ]

/** The per-person, per-cabildeo nullifier; each dev account is its own person. */
export const devVoteNullifier = (actorDid: string, subjectUri: string) =>
  createHash('sha256')
    .update(JSON.stringify(['dev-vote', actorDid, subjectUri]))
    .digest('hex')

export const devCabildeoVoteProof = (
  actorDid: string,
  subjectUri: string,
  selectedOption: number,
  voteNullifier = devVoteNullifier(actorDid, subjectUri),
) => ({
  voteNullifier,
  eligibilityProofRef: `m8:cabildeo:v1:${devMac([
    'vote',
    actorDid,
    subjectUri,
    selectedOption,
    voteNullifier,
  ])}`,
})

export const devDelegationProof = (
  actorDid: string,
  claim: DevDelegationClaim,
) => {
  const id = randomUUID()
  return `m8:delegation:v1:${id}:${devMac([
    'delegation',
    id,
    actorDid,
    canonicalClaim(claim),
  ])}`
}

const isDevVoteProof = (body: Record<string, unknown>) =>
  typeof body.actorDid === 'string' &&
  typeof body.subjectUri === 'string' &&
  typeof body.voteNullifier === 'string' &&
  body.eligibilityProofRef ===
    devCabildeoVoteProof(
      body.actorDid,
      body.subjectUri,
      body.selectedOption as number,
      body.voteNullifier,
    ).eligibilityProofRef

const devDelegationMatch = (body: Record<string, unknown>) => {
  const match = /^m8:delegation:v1:([0-9a-f-]{36}):([A-Za-z0-9_-]{43})$/.exec(
    String(body.eligibilityProofRef),
  )
  if (!match || typeof body.actorDid !== 'string') return false
  try {
    return (
      match[2] ===
      devMac([
        'delegation',
        match[1],
        body.actorDid,
        canonicalClaim(body as unknown as DevDelegationClaim),
      ])
    )
  } catch {
    return false
  }
}

type Reply = { status: number; body?: unknown }

export class DevCivicVerifier {
  private constructor(
    public url: string,
    private server: http.Server,
    private restoreEnv: () => void,
  ) {}

  /**
   * Starts the verifier and points the PDS and AppView at it, unless a
   * verifier is already configured (a test or the operator chose one).
   */
  static async startIfUnconfigured(
    opts: { upstreamUrl?: string; upstreamResolverSecret?: string } = {},
  ): Promise<DevCivicVerifier | undefined> {
    if (process.env.PARA_CIVIC_VOTE_VERIFIER_URL) return undefined

    const resolverSecret =
      process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET ||
      randomBytes(32).toString('base64url')
    const upstream = opts.upstreamUrl?.replace(/\/+$/, '')

    const forward = async (
      path: string,
      body: Record<string, unknown>,
    ): Promise<Reply> => {
      if (!upstream) return { status: 422 }
      const resolving = typeof body.subjectUri === 'string'
      try {
        const res = await fetch(`${upstream}${path}`, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(2500),
          headers: {
            'content-type': 'application/json',
            ...(resolving && opts.upstreamResolverSecret
              ? { 'x-m8-resolver-secret': opts.upstreamResolverSecret }
              : {}),
          },
          body: JSON.stringify(body),
        })
        const text = await res.text()
        return { status: res.status, body: text ? JSON.parse(text) : undefined }
      } catch {
        return { status: 503 }
      }
    }

    const handle = async (
      body: Record<string, unknown>,
      resolverHeader: string | undefined,
    ): Promise<Reply> => {
      const ref = String(body.eligibilityProofRef ?? '')
      if (ref.startsWith('m8:cabildeo:v1:')) {
        if (isDevVoteProof(body)) return { status: 204 }
        return forward('/identity/civic-vote-proof/verify', body)
      }
      if (ref.startsWith('m8:delegation:v1:')) {
        const resolving = typeof body.subjectUri === 'string'
        if (resolving && resolverHeader !== resolverSecret) {
          return { status: 403, body: { code: 'RESOLVER_FORBIDDEN' } }
        }
        if (!devDelegationMatch(body)) {
          return forward('/identity/civic-delegation-proof/verify', body)
        }
        if (!resolving) return { status: 204 }
        if (body.mode === 'active' && body.cabildeo !== body.subjectUri) {
          return { status: 422 }
        }
        return {
          status: 200,
          body: {
            voteNullifier: devVoteNullifier(
              body.actorDid as string,
              body.subjectUri as string,
            ),
          },
        }
      }
      return { status: 422 }
    }

    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > 16_384) req.destroy()
        else chunks.push(chunk)
      })
      req.on('end', async () => {
        let reply: Reply
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const header = req.headers['x-m8-resolver-secret']
          reply =
            req.method === 'POST' && body && typeof body === 'object'
              ? await handle(body, Array.isArray(header) ? header[0] : header)
              : { status: 400 }
        } catch {
          reply = { status: 400 }
        }
        if (reply.body === undefined) {
          res.writeHead(reply.status).end()
        } else {
          res
            .writeHead(reply.status, { 'content-type': 'application/json' })
            .end(JSON.stringify(reply.body))
        }
      })
    })
    server.listen(0, '127.0.0.1')
    await events.once(server, 'listening')
    const { port } = server.address() as AddressInfo
    const url = `http://127.0.0.1:${port}/verify`

    const keys = [
      'PARA_CIVIC_VOTE_VERIFIER_URL',
      'PARA_CIVIC_DELEGATION_VERIFIER_URL',
      'PARA_CIVIC_DELEGATION_RESOLVER_SECRET',
    ] as const
    const previous = keys.map((key) => process.env[key])
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = url
    process.env.PARA_CIVIC_DELEGATION_VERIFIER_URL = url
    process.env.PARA_CIVIC_DELEGATION_RESOLVER_SECRET = resolverSecret

    return new DevCivicVerifier(url, server, () => {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key]
        else process.env[key] = previous[i]
      })
    })
  }

  async close() {
    this.restoreEnv()
    this.server.close()
    await events.once(this.server, 'close')
  }
}
