export interface Config {
  pdsFirehoseUrl: string
  matrixHomeserverUrl: string
  /**
   * The homeserver URL clients should connect to, as opposed to the internal
   * one this service uses. Clients need a real, resolvable address: the
   * previous code derived it by rewriting the internal URL
   * (`http://synapse:8008` -> `https://synapse`), which resolves nowhere.
   */
  matrixPublicHomeserverUrl: string
  matrixAdminToken: string
  matrixAppServiceToken?: string
  matrixHsToken?: string
  syncFallbackMs: number
  matrixBotUserId?: string
  matrixEnableEncryption: boolean
  m8BaseUrl: string
  pushGatewayUrl: string
  dbPath: string
  databaseUrl?: string
  logLevel: string
  port: number
  openaiApiKey?: string
  openaiModel?: string
}

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return val
}

export function loadConfig(): Config {
  return {
    pdsFirehoseUrl: env(
      'PDS_FIREHOSE_URL',
      'wss://pds.para.social/xrpc/com.atproto.sync.subscribeRepos',
    ),
    matrixHomeserverUrl: env('MATRIX_HOMESERVER_URL', 'http://synapse:8008'),
    matrixPublicHomeserverUrl: env(
      'MATRIX_PUBLIC_HOMESERVER_URL',
      `https://${process.env.MATRIX_SERVER_NAME || 'matrix.para.social'}`,
    ),
    matrixAdminToken: env('MATRIX_ADMIN_TOKEN'),
    // Appservice token for m.login.application_service device-bound logins.
    // Never substitute an administrator credential for an appservice credential.
    matrixAppServiceToken: process.env.MATRIX_APPSERVICE_TOKEN || undefined,
    // hs_token from the appservice registration; required to accept
    // transaction pushes from Synapse.
    matrixHsToken: process.env.MATRIX_HS_TOKEN || undefined,
    syncFallbackMs: parseInt(
      process.env.BRIDGE_SYNC_FALLBACK_MS || '300000',
      10,
    ),
    matrixBotUserId: process.env.MATRIX_BOT_USER_ID || undefined,
    matrixEnableEncryption:
      process.env.MATRIX_ENABLE_ENCRYPTION === 'true' || false,
    m8BaseUrl: env('M8_BASE_URL', 'http://localhost:8787/v1'),
    pushGatewayUrl: env(
      'PUSH_GATEWAY_URL',
      'http://para-matrix-bridge:3001/_matrix/push/v1/notify',
    ),
    dbPath: env('BRIDGE_DB_PATH', '/data/bridge.db'),
    databaseUrl: process.env.DATABASE_URL,
    logLevel: env('BRIDGE_LOG_LEVEL', 'info'),
    port: parseInt(env('PORT', '3001'), 10),
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  }
}
