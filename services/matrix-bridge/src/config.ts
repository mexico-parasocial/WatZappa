export interface Config {
  pdsFirehoseUrl: string
  matrixHomeserverUrl: string
  matrixAdminToken: string
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
    matrixAdminToken: env('MATRIX_ADMIN_TOKEN'),
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
