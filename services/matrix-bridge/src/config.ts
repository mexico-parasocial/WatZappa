import { parseCorsOrigins } from './cors.js'

export interface Config {
  pdsFirehoseUrl: string
  pdsSourceId?: string
  backfillFromStart: boolean
  /**
   * DID PLC directory used to resolve firehose commits. Defaults to the public
   * directory; a local dev-env mints DIDs on its own PLC (:2582), and without
   * this the resolver 404s on every one of them and the consumer silently
   * drops every event.
   */
  plcUrl?: string
  /**
   * Whether this bridge runs Matrix chat. Off (`MATRIX_CHAT_ENABLED=false`),
   * it serves community context — constitution,
   * moderation and badges — from the firehose and its database, with no
   * homeserver behind it: no admin client, no sync poller, no room
   * provisioning, and chat routes answer 503 CHAT_DISABLED. The Matrix
   * settings below are then optional.
   */
  matrixChatEnabled: boolean
  matrixHomeserverUrl: string
  /**
   * The homeserver's own `server_name`, not the host of
   * `MATRIX_HOMESERVER_URL`. They differ everywhere but production: dev
   * reaches Synapse at `localhost`, compose at `synapse`, while the server
   * names itself `matrix.para.social`. Deriving MXIDs from the URL host
   * minted users Synapse treats as foreign and refuses to act on.
   */
  matrixServerName: string
  /**
   * The homeserver URL clients should connect to, as opposed to the internal
   * one this service uses. Clients need a real, resolvable address: the
   * previous code derived it by rewriting the internal URL
   * (`http://synapse:8008` -> `https://synapse`), which resolves nowhere.
   */
  matrixPublicHomeserverUrl: string
  /** Required when chat is enabled; unset when it is off. */
  matrixAdminToken?: string
  matrixAppServiceToken?: string
  /** Legacy standalone homeservers only. MAS accounts belong to client OIDC. */
  matrixAllowAppServiceLogin?: boolean
  /**
   * Confidential MAS admin client (private listener). Device revocation
   * finishes the device's MAS sessions through it before deleting the
   * Synapse device; without it, refresh tokens outlive the deletion.
   */
  matrixMasAdminUrl?: string
  matrixMasTokenUrl?: string
  matrixMasClientId?: string
  matrixMasClientSecret?: string
  matrixHsToken?: string
  syncFallbackMs: number
  /**
   * Membership-lease TTL (CD-M6): how long a chat account stays in a
   * community's rooms without a verified interaction. 0 disables the sweep.
   */
  membershipLeaseTtlMs: number
  matrixBotUserId?: string
  matrixEnableEncryption: boolean
  m8BaseUrl: string
  authorityAppviewUrl?: string
  authorityServiceToken?: string
  pushGatewayUrl: string
  dbPath: string
  databaseUrl?: string
  logLevel: string
  port: number
  /**
   * Exact web origins allowed to call the API from a browser
   * (`BRIDGE_CORS_ORIGINS`, comma-separated). Empty means no CORS headers:
   * native clients do not need them.
   */
  corsAllowedOrigins: string[]
}

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return val
}

/**
 * The Firehose appends `/xrpc/com.atproto.sync.subscribeRepos` to this URL
 * itself; a full subscription URL here doubles the path and the PDS 404s
 * every upgrade attempt (retried silently forever). Accept both shapes.
 */
function firehoseServiceBase(url: string): string {
  return url.replace(/\/xrpc\/com\.atproto\.sync\.subscribeRepos\/?$/, '')
}

/** Chat is on unless explicitly turned off. */
function chatEnabled(): boolean {
  const raw = process.env.MATRIX_CHAT_ENABLED?.trim().toLowerCase()
  return !(raw === 'false' || raw === '0' || raw === 'off' || raw === 'no')
}

export function loadConfig(): Config {
  const matrixChatEnabled = chatEnabled()
  return {
    matrixChatEnabled,
    pdsSourceId: process.env.BRIDGE_PDS_SOURCE_ID || undefined,
    backfillFromStart: process.env.BRIDGE_BACKFILL_FROM_START === '1',
    plcUrl: process.env.PLC_URL || undefined,
    pdsFirehoseUrl: firehoseServiceBase(
      env('PDS_FIREHOSE_URL', 'wss://pds.para.social'),
    ),
    matrixHomeserverUrl: env('MATRIX_HOMESERVER_URL', 'http://synapse:8008'),
    matrixServerName: env('MATRIX_SERVER_NAME', 'matrix.para.social'),
    matrixPublicHomeserverUrl: env(
      'MATRIX_PUBLIC_HOMESERVER_URL',
      `https://${process.env.MATRIX_SERVER_NAME || 'matrix.para.social'}`,
    ),
    matrixAdminToken: matrixChatEnabled
      ? env('MATRIX_ADMIN_TOKEN')
      : process.env.MATRIX_ADMIN_TOKEN || undefined,
    // Appservice token for m.login.application_service device-bound logins.
    // Never substitute an administrator credential for an appservice credential.
    matrixAppServiceToken: process.env.MATRIX_APPSERVICE_TOKEN || undefined,
    matrixAllowAppServiceLogin:
      process.env.MATRIX_ALLOW_APPSERVICE_LOGIN === 'true',
    matrixMasAdminUrl: process.env.MATRIX_MAS_ADMIN_URL || undefined,
    matrixMasTokenUrl: process.env.MATRIX_MAS_TOKEN_URL || undefined,
    matrixMasClientId: process.env.MATRIX_MAS_CLIENT_ID || undefined,
    matrixMasClientSecret: process.env.MATRIX_MAS_CLIENT_SECRET || undefined,
    // hs_token from the appservice registration; required to accept
    // transaction pushes from Synapse.
    matrixHsToken: process.env.MATRIX_HS_TOKEN || undefined,
    syncFallbackMs: parseInt(
      process.env.BRIDGE_SYNC_FALLBACK_MS || '300000',
      10,
    ),
    membershipLeaseTtlMs: parseInt(
      process.env.BRIDGE_MEMBERSHIP_LEASE_TTL_MS ||
        String(30 * 24 * 3600 * 1000),
      10,
    ),
    matrixBotUserId: process.env.MATRIX_BOT_USER_ID || undefined,
    matrixEnableEncryption:
      process.env.MATRIX_ENABLE_ENCRYPTION === 'true' || false,
    m8BaseUrl: env('M8_BASE_URL', 'http://localhost:8787/v1'),
    authorityAppviewUrl: process.env.BRIDGE_AUTHORITY_APPVIEW_URL || undefined,
    authorityServiceToken:
      process.env.PARA_AUTHORITY_SERVICE_TOKEN || undefined,
    pushGatewayUrl: env(
      'PUSH_GATEWAY_URL',
      'http://para-matrix-bridge:3001/_matrix/push/v1/notify',
    ),
    dbPath: env('BRIDGE_DB_PATH', '/data/bridge.db'),
    databaseUrl: process.env.DATABASE_URL,
    logLevel: env('BRIDGE_LOG_LEVEL', 'info'),
    port: parseInt(env('PORT', '3001'), 10),
    corsAllowedOrigins: parseCorsOrigins(process.env.BRIDGE_CORS_ORIGINS),
  }
}
