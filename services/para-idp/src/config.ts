import type { IdpConfig, OidcClient } from './oidc.js'

export interface Config extends IdpConfig {
  port: number
  /** Custom URL scheme the PARA app registers, used for the login deep link. */
  appScheme: string
  alg: 'RS256' | 'EdDSA'
  privateKeyPem?: string
  logLevel: string
}

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (value === undefined) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

/**
 * Clients are configured, never dynamically registered. There is exactly one
 * relying party in this design — MAS — and an IdP that accepts registrations
 * is an IdP that can be pointed at an attacker's redirect_uri.
 *
 * PARA_IDP_CLIENTS is JSON: [{ "clientId": "...", "clientSecret": "...",
 * "redirectUris": ["https://..."] }]
 */
function parseClients(raw: string): OidcClient[] {
  const parsed = JSON.parse(raw) as OidcClient[]
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('PARA_IDP_CLIENTS must be a non-empty JSON array')
  }
  for (const client of parsed) {
    if (!client.clientId || !client.clientSecret || !Array.isArray(client.redirectUris)) {
      throw new Error('each client needs clientId, clientSecret and redirectUris')
    }
    if (client.redirectUris.length === 0) {
      throw new Error(`client ${client.clientId} has no redirectUris`)
    }
    if (client.clientSecret.length < 32) {
      throw new Error(`client ${client.clientId} secret is too short (min 32 chars)`)
    }
  }
  return parsed
}

export function loadConfig(): Config {
  const issuer = env('PARA_IDP_ISSUER', 'http://localhost:8090').replace(/\/$/, '')
  return {
    issuer,
    clients: parseClients(env('PARA_IDP_CLIENTS')),
    port: Number.parseInt(env('PORT', '8090'), 10),
    appScheme: env('PARA_IDP_APP_SCHEME', 'para'),
    alg: (process.env.PARA_IDP_ALG as 'RS256' | 'EdDSA') || 'RS256',
    privateKeyPem: process.env.PARA_IDP_PRIVATE_KEY,
    logLevel: env('PARA_IDP_LOG_LEVEL', 'info'),
  }
}
