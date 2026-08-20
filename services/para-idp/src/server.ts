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

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    // This page carries a login challenge: never let it be framed or sniffed.
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
  })
  res.end(body)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

/**
 * The page MAS's browser redirect lands on.
 *
 * There is no password field here because there is no password: the user's
 * key lives on their phone. The page hands the challenge to the PARA app over
 * a deep link, then waits for the app to finish signing.
 *
 * Deliberately dependency-free and inline — a login page that pulls in remote
 * scripts is a login page whose behaviour someone else controls.
 */
function loginPage(deepLink: string, sessionId: string, appName: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in with PARA</title>
<style>
  :root{color-scheme:light dark}
  body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;
       background:Canvas;color:CanvasText}
  main{max-width:26rem;padding:2rem;text-align:center}
  h1{font-size:1.375rem;margin:0 0 .5rem}
  p{margin:0 0 1.5rem;opacity:.75}
  a.btn{display:inline-block;padding:.75rem 1.5rem;border:1px solid currentColor;
        border-radius:.5rem;text-decoration:none;color:inherit;font-weight:600}
  .status{margin-top:1.5rem;font-size:.875rem;opacity:.6}
</style>
<main>
  <h1>Sign in with PARA</h1>
  <p>Approve this sign-in on your phone. ${escapeHtml(appName)} never sees your keys.</p>
  <a class="btn" href="${escapeHtml(deepLink)}">Open PARA</a>
  <div class="status" id="s">Waiting for approval\u2026</div>
</main>
<script>
(function(){
  var s = document.getElementById('s');
  var tries = 0;
  function poll(){
    if (++tries > 150) { s.textContent = 'This sign-in expired. Start again.'; return; }
    fetch('/authorize/status?session=' + encodeURIComponent(${JSON.stringify(sessionId)}), {cache:'no-store'})
      .then(function(r){ return r.json() })
      .then(function(d){
        if (d.redirect_uri) { s.textContent = 'Approved. Redirecting\u2026'; location.href = d.redirect_uri }
        else setTimeout(poll, 2000)
      })
      .catch(function(){ setTimeout(poll, 2000) });
  }
  setTimeout(poll, 1500);
})();
</script>`
}

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
        return json(res, 200, discoveryDocument(config.issuer, signer.alg))
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

        const { challenge, sessionId } = store.createChallenge({
          clientId,
          redirectUri: resolved,
          state,
          nonce,
          codeChallenge,
          codeChallengeMethod: 'S256',
        })

        // MAS sends a *browser* here, so the default response is a page. The
        // JSON form exists for the app driving the flow itself and for tests.
        const accept = String(req.headers.accept ?? '')
        if (accept.includes('text/html')) {
          const deepLink = `${config.appScheme}://idp-login?challenge=${encodeURIComponent(
            challenge,
          )}&issuer=${encodeURIComponent(config.issuer)}`
          return html(res, 200, loginPage(deepLink, sessionId, 'Matrix'))
        }

        // `audience` is echoed so the client signs the value this issuer will
        // check, rather than guessing it.
        return json(res, 200, {
          challenge,
          session_id: sessionId,
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

        // Release the browser that is waiting on this session.
        store.completeSession(pending.sessionId, redirect.toString())
        return json(res, 200, { redirect_uri: redirect.toString() })
      }

      // ─── 2b. The waiting browser asks whether the phone is done ─────────
      if (path === '/authorize/status' && req.method === 'GET') {
        const sessionId = url.searchParams.get('session') ?? ''
        const redirectUri = store.takeCompletion(sessionId)
        res.writeHead(200, { ...JSON_HEADERS, 'Cache-Control': 'no-store' })
        // Always 200: a polling page must not be able to distinguish "no such
        // session" from "not finished yet", or it becomes a session oracle.
        res.end(JSON.stringify(redirectUri ? { redirect_uri: redirectUri } : { pending: true }))
        return
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
