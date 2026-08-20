# para-idp

The OIDC shim between a PARA identity and Matrix Authentication Service.

Spec: [`docs/MATRIX_V2.md`](../../docs/MATRIX_V2.md) §3.2 · CD-M1 (localpart) ·
CD-M4 (signatures) · mubEZ `docs/IDENTITY_SIGNATURES.md` (CD-7).

## What it is for

Matrix accounts in v2 are named by a hash of the user's identity public key, so
that **no table anywhere relates a DID to a chat account**. That only works if
the account name cannot be claimed by whoever learns the key — public keys are
public. para-idp is where possession is proved.

MAS is the relying party. para-idp authenticates the PARA identity and asserts
a subject. **MAS never sees a ristretto key, a DID, or a handle** — it sees a
subject, which is a hash of a public key.

## Flow

There is one extra step compared to a normal IdP, because the user has no
password here — they have a key.

```
MAS ──GET /authorize──────────────▶ para-idp     validate OIDC params,
                                                 mint a single-use challenge
    ◀─────────────── {challenge} ──

app ──POST /authorize/verify─────▶ para-idp      verify the sr25519 signature,
     {challenge, assertion, sig}                 consume the challenge,
    ◀──────────── {redirect_uri} ──              issue an authorization code

MAS ──POST /token────────────────▶ para-idp      authenticate client, verify
     code + PKCE verifier                        PKCE, consume the code
    ◀──────────────── {id_token} ──              sub = CD-M1 localpart
```

## Endpoints

| | |
|---|---|
| `GET /.well-known/openid-configuration` | discovery |
| `GET /jwks.json` | public signing key |
| `GET /authorize` | starts a login, returns a challenge to sign |
| `POST /authorize/verify` | proof of possession → authorization code |
| `POST /token` | code → ID token |
| `GET /healthz` | liveness |

## Configuration

| Variable | Default | |
|---|---|---|
| `PARA_IDP_ISSUER` | `http://localhost:8090` | Must match what MAS is configured with |
| `PARA_IDP_CLIENTS` | *(required)* | JSON array of `{clientId, clientSecret, redirectUris}` |
| `PARA_IDP_PRIVATE_KEY` | *(none)* | Ed25519 PKCS#8 PEM. **Set this in production** |
| `PORT` | `8090` | |
| `PARA_IDP_LOG_LEVEL` | `info` | |

Without `PARA_IDP_PRIVATE_KEY` an ephemeral key is generated and logged as a
warning: every restart rotates the JWKS and invalidates outstanding tokens.

Clients are configured, never dynamically registered — an IdP that accepts
registrations is an IdP that can be pointed at an attacker's `redirect_uri`.

## Deliberate limits

- **Authorization code + PKCE (S256) only.** No implicit flow, no refresh
  tokens, no userinfo, no consent screen. Every feature omitted is one that
  cannot be misconfigured. `plain` PKCE is rejected, not merely discouraged.
- **Exact redirect_uri matching.** No prefixes, no wildcards. An unregistered
  `redirect_uri` fails *in place* rather than redirecting, so a code is never
  delivered to whoever asked for it.
- **Challenges and codes are single-use and in-memory.** They live for seconds,
  and persisting them would create a store relating identity keys to login
  attempts — a linkage table by another name. The cost is that **this service
  does not scale horizontally**: two replicas do not share the map, so a code
  issued by one cannot be redeemed at the other. Run one instance.
- **The verifier re-implements the scheme** rather than importing mubEZ's,
  because they are separate repositories. The shared vectors in `src/__tests__`
  are what keep the copies honest; if those tests fail, a signature made on a
  device will not verify here.

## Tests

```bash
pnpm test
```

Covers the full flow with a real identity key from the shared vectors, plus the
security properties worth regression-testing: challenge replay, code replay,
PKCE mismatch, wrong client secret, wrong audience, and unregistered redirects.
