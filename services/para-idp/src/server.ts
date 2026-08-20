import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  authenticateClient,
  discoveryDocument,
  resolveRedirectUri,
  verifyPkce,
  Signer,
  type IdpConfig,
} from './oidc.js'
import { LoginStore } from './store.js'
import { subjectFor, verifyIdentityAssertion, type SignedAssertion } from './identity.js'

/*
 * para-idp — the OIDC shim between a PARA identity and Matrix Authentication
 * Service. Spec: WatZappa/docs/MATRIX_V2.md §3.2.
 *
 * The flow, and why it has an extra step compared to a normal IdP:
 *
 *   1. MAS redirects to GET /authorize with the usual OIDC parameters.
 *      para-idp validates them, mints a single-use challenge bound to that
 *      request, and returns it. There is no password prompt — the user does
 *      not have a password here, they have a key.
 *   2. The PARA app signs the challenge with the identity the user chose
 *      (public or community; never the ballot identity) and POSTs the
 *      assertion to /authorize/verify.
 *   3. para-idp verifies the signature, consumes the challenge, and returns
 *      the redirect back to MAS carrying an authorization code.
 *   4. MAS exchanges the code at /token for an ID token whose `sub` is the
 *      CD-M1 localpart.
 *
 * MAS never sees a ristretto key, a DID, or anything else about the user. It
 * sees a subject, which is a hash of a public key.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/** OAuth errors are returned to the client, so they must not leak internals. */
function oauthError(
  res: ServerResponse,
  status: number,
  error: string,
  description?: string,
): void {
  json(res, status, { error, ...(description ? { error_description: description } : {}) })
}

async function readJsonBody(req: IncomingMessage, limitBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limitBytes) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function readFormBody(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  return Object.fromEntries(params)
}

export interface ServerDeps {
  config: IdpConfig
  signer: Signer
  store: LoginStore
  now?: () => Date
}

export function createHandler(deps: ServerDeps) {
  const { config, signer, store } = deps

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', config.issuer)
    const path = url.pathname

    try {
      if (path === '/healthz') return json(res, 200, { ok: true })

      if (path === '/.well-known/openid-configuration' && req.method === 'GET') {
        return json(res, 200, discoveryDocument(config.issuer))
      }

      if (path === '/jwks.json' && req.method === 'GET') {
        return json(res, 200, signer.jwks())
      }

      // ─── 1. MAS starts the flow ──────────────────────────────────────────
      if (path === '/authorize' && req.method === 'GET') {
        const q = url.searchParams
        const clientId = q.get('client_id') ?? ''
        const redirectUri = q.get('redirect_uri') ?? ''
        const client = config.clients.find((c) => c.clientId === clientId)

        // An unregistered client or an unregistered redirect_uri must NOT be
        // redirected to — that would be an open redirect, and would hand the
        // code to whoever asked. Fail in place instead.
        const resolved = resolveRedirectUri(client, redirectUri)
        if (!client || !resolved) {
          return oauthError(res, 400, 'invalid_request', 'unknown client or redirect_uri')
        }
        if (q.get('response_type') !== 'code') {
          return oauthError(res, 400, 'unsupported_response_type')
        }
        if (q.get('code_challenge_method') !== 'S256') {
          return oauthError(res, 400, 'invalid_request', 'PKCE S256 is required')
        }
        const codeChallenge = q.get('code_challenge') ?? ''
        const nonce = q.get('nonce') ?? ''
        const state = q.get('state') ?? ''
        if (!codeChallenge || !nonce) {
          return oauthError(res, 400, 'invalid_request', 'code_challenge and nonce are required')
        }

        const challenge = store.createChallenge({
          clientId,
          redirectUri: resolved,
          state,
          nonce,
          codeChallenge,
          codeChallengeMethod: 'S256',
        })

        // The app signs this. `audience` is echoed so the client signs the
        // value this issuer will check, rather than guessing it.
        return json(res, 200, {
          challenge,
          audience: 'para-idp',
          purpose: 'matrix-login',
          expires_in: 300,
        })
      }

      // ─── 2. The app proves possession ────────────────────────────────────
      if (path === '/authorize/verify' && req.method === 'POST') {
        const body = (await readJsonBody(req)) as {
          challenge?: unknown
          assertion?: unknown
          signature?: unknown
        }
        if (typeof body?.challenge !== 'string') {
          return oauthError(res, 400, 'invalid_request', 'challenge is required')
        }

        // Taking the challenge consumes it: a replay of this request finds
        // nothing, whether or not the signature was valid.
        const pending = store.takeChallenge(body.challenge)
        if (!pending) {
          return oauthError(res, 400, 'invalid_grant', 'unknown or expired challenge')
        }

        const signed = {
          assertion: body.assertion,
          signature: body.signature,
        } as SignedAssertion

        const ok = verifyIdentityAssertion(signed, {
          purpose: 'matrix-login',
          audience: 'para-idp',
          challenge: body.challenge,
          now: deps.now?.(),
        })
        if (!ok) {
          return oauthError(res, 401, 'access_denied', 'assertion did not verify')
        }

        const code = store.createCode({
          subject: subjectFor(signed.assertion),
          clientId: pending.clientId,
          redirectUri: pending.redirectUri,
          nonce: pending.nonce,
          codeChallenge: pending.codeChallenge,
        })

        const redirect = new URL(pending.redirectUri)
        redirect.searchParams.set('code', code)
        if (pending.state) redirect.searchParams.set('state', pending.state)
        return json(res, 200, { redirect_uri: redirect.toString() })
      }

      // ─── 3. MAS redeems the code ────────────────────────────────────────
      if (path === '/token' && req.method === 'POST') {
        const form = await readFormBody(req)
        if (form.grant_type !== 'authorization_code') {
          return oauthError(res, 400, 'unsupported_grant_type')
        }
        const client = authenticateClient(config, form.client_id, form.client_secret)
        if (!client) {
          return oauthError(res, 401, 'invalid_client')
        }

        const record = store.takeCode(form.code ?? '')
        if (!record) {
          return oauthError(res, 400, 'invalid_grant', 'unknown or expired code')
        }
        // A code issued to one client must not be redeemable by another, even
        // with valid credentials.
        if (record.clientId !== client.clientId) {
          return oauthError(res, 400, 'invalid_grant', 'code was issued to another client')
        }
        if (record.redirectUri !== form.redirect_uri) {
          return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch')
        }
        if (!verifyPkce(form.code_verifier ?? '', record.codeChallenge)) {
          return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed')
        }

        const idToken = await signer.issueIdToken({
          issuer: config.issuer,
          audience: client.clientId,
          subject: record.subject,
          nonce: record.nonce,
        })

        res.writeHead(200, { ...JSON_HEADERS, 'Cache-Control': 'no-store' })
        res.end(
          JSON.stringify({
            access_token: idToken,
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 300,
          }),
        )
        return
      }

      json(res, 404, { error: 'not_found' })
    } catch {
      // Never surface an internal error to an OAuth client.
      oauthError(res, 400, 'invalid_request')
    }
  }
}

export function createIdpServer(deps: ServerDeps) {
  return createServer((req, res) => {
    void createHandler(deps)(req, res)
  })
}
