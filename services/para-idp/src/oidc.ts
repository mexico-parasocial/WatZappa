import { createHash, timingSafeEqual } from 'node:crypto'
import { SignJWT, exportJWK, generateKeyPair, importPKCS8, type JWK } from 'jose'

/*
 * The OIDC half of para-idp.
 *
 * para-idp is a thin upstream identity provider for Matrix Authentication
 * Service: MAS is the relying party, para-idp authenticates the PARA identity
 * and asserts a subject. The subject is the CD-M1 localpart, so MAS creates an
 * account whose name is a function of client-held key material and no table
 * anywhere relates it to a DID.
 *
 * Deliberately minimal. This implements the authorization-code flow with PKCE
 * and nothing else: no refresh tokens, no userinfo, no dynamic registration,
 * no consent screen. Every feature omitted is one that cannot be misconfigured.
 */

/**
 * ID token signing algorithm.
 *
 * RS256 by default, not because it is the better algorithm — EdDSA is smaller
 * and faster — but because it is the one every relying party can verify.
 * Matrix Authentication Service rejected EdDSA tokens with "none of the keys
 * worked", and an IdP that a relying party cannot verify is not an IdP.
 * Override with PARA_IDP_ALG once the consumer is known to support it.
 */
export type SigningAlg = 'RS256' | 'EdDSA'
export const DEFAULT_ALG: SigningAlg = 'RS256'

export interface OidcClient {
  clientId: string
  clientSecret: string
  redirectUris: string[]
}

export interface IdpConfig {
  issuer: string
  clients: OidcClient[]
  /** Custom URL scheme for the PARA app deep link. */
  appScheme: string
}

export class Signer {
  private constructor(
    private readonly privateKey: CryptoKey,
    readonly publicJwk: JWK,
    readonly kid: string,
    readonly alg: SigningAlg,
  ) {}

  /**
   * Loads the signing key from PEM, or generates an ephemeral one.
   *
   * An ephemeral key means every restart invalidates outstanding tokens and
   * changes the JWKS. Acceptable for tests and local development; in
   * production PARA_IDP_PRIVATE_KEY must be set, or MAS will intermittently
   * reject tokens it cannot verify.
   */
  static async load(pkcs8Pem?: string, alg: SigningAlg = DEFAULT_ALG): Promise<Signer> {
    const { privateKey, publicKey } = pkcs8Pem
      ? {
          privateKey: await importPKCS8(pkcs8Pem, alg, { extractable: true }),
          publicKey: undefined as unknown as CryptoKey,
        }
      : await generateKeyPair(alg, { extractable: true })

    // Derive the public JWK from whichever half we have.
    const jwk = publicKey ? await exportJWK(publicKey) : await exportJWK(privateKey)
    // Strip every private field before this is ever published as JWKS. RSA
    // private keys carry more than `d` — leaving any of these in would publish
    // the signing key itself.
    // `as unknown as` because jose's JWK type does not index-signature; the
    // newer jose in the container build rejects the direct cast.
    const mutable = jwk as unknown as Record<string, unknown>
    for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      delete mutable[field]
    }
    jwk.alg = alg
    jwk.use = 'sig'
    const kid = createHash('sha256')
      .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, n: jwk.n, e: jwk.e }))
      .digest('base64url')
      .slice(0, 16)
    jwk.kid = kid
    return new Signer(privateKey as CryptoKey, jwk, kid, alg)
  }

  async issueIdToken(input: {
    issuer: string
    audience: string
    subject: string
    nonce: string
    expiresInSeconds?: number
  }): Promise<string> {
    return new SignJWT({ nonce: input.nonce })
      .setProtectedHeader({ alg: this.alg, kid: this.kid, typ: 'JWT' })
      .setIssuer(input.issuer)
      .setAudience(input.audience)
      .setSubject(input.subject)
      .setIssuedAt()
      .setExpirationTime(`${input.expiresInSeconds ?? 300}s`)
      .sign(this.privateKey)
  }

  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] }
  }
}

export function discoveryDocument(
  issuer: string,
  alg: SigningAlg = DEFAULT_ALG,
): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [alg],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    // PKCE is required, not merely supported. See verifyPkce.
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce'],
  }
}

/**
 * PKCE verification, S256 only.
 *
 * `plain` is not accepted: it offers no protection at all, and supporting it
 * would let a client downgrade itself by choosing the method.
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (typeof verifier !== 'string' || typeof challenge !== 'string') return false
  if (verifier.length < 43 || verifier.length > 128) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Redirect URIs must match a registered value exactly.
 *
 * No prefix matching, no wildcards, no normalisation. Loose redirect matching
 * is the classic way authorization codes get delivered to an attacker.
 */
export function resolveRedirectUri(
  client: OidcClient | undefined,
  redirectUri: string,
): string | undefined {
  if (!client) return undefined
  return client.redirectUris.includes(redirectUri) ? redirectUri : undefined
}

export function authenticateClient(
  config: IdpConfig,
  clientId: unknown,
  clientSecret: unknown,
): OidcClient | undefined {
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') return undefined
  const client = config.clients.find((c) => c.clientId === clientId)
  if (!client) return undefined
  const a = Buffer.from(client.clientSecret)
  const b = Buffer.from(clientSecret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return client
}
