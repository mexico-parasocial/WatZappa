import type { TestServerParams } from './types.js'

export type DevEnvRuntimeConfig = {
  networkParams: Partial<TestServerParams>
  skipMockSetup: boolean
  skipParaDemoSeed: boolean
}

type Env = Record<string, string | undefined>

export const withoutPersistentPdsStorage = (
  params: Partial<TestServerParams['pds']> = {},
): Partial<TestServerParams['pds']> => {
  const sanitized = { ...params }
  delete sanitized.dataDirectory
  delete sanitized.blobstoreDiskLocation
  delete sanitized.accountDbLocation
  return sanitized
}

const envStr = (env: Env, name: string): string | undefined => {
  const value = env[name]
  return value === undefined || value === '' ? undefined : value
}

const envInt = (env: Env, name: string, defaultValue: number): number => {
  const value = envStr(env, name)
  if (value === undefined) return defaultValue

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`)
  }
  return parsed
}

const envBool = (env: Env, name: string, defaultValue: boolean): boolean => {
  const value = envStr(env, name)
  if (value === undefined) return defaultValue
  return value === '1' || value.toLowerCase() === 'true'
}

export const buildDevEnvRuntimeConfig = (
  env: Env = process.env,
): DevEnvRuntimeConfig => {
  const pdsPort = envInt(env, 'DEV_ENV_PDS_PORT', 2583)
  const bskyPort = envInt(env, 'DEV_ENV_BSKY_PORT', 2584)
  const plcPort = envInt(env, 'DEV_ENV_PLC_PORT', 2582)
  const chatPort = envInt(env, 'DEV_ENV_CHAT_PORT', 2590)
  const ozonePort = envInt(env, 'DEV_ENV_OZONE_PORT', 2587)
  const introspectPort = envInt(env, 'DEV_ENV_INTROSPECT_PORT', 2581)
  const hostname = envStr(env, 'DEV_ENV_PDS_HOSTNAME') ?? 'localhost'
  const bskyPublicUrl =
    envStr(env, 'DEV_ENV_BSKY_PUBLIC_URL') ?? `http://localhost:${bskyPort}`
  const dbPostgresSchema = envStr(env, 'DB_POSTGRES_SCHEMA') ?? 'dev'

  return {
    networkParams: {
      dbPostgresSchema,
      pds: {
        port: pdsPort,
        hostname,
        enableDidDocWithSession: envBool(
          env,
          'DEV_ENV_ENABLE_DID_DOC_WITH_SESSION',
          true,
        ),
        dataDirectory: envStr(env, 'DEV_ENV_PDS_DATA_DIRECTORY'),
        blobstoreDiskLocation: envStr(env, 'DEV_ENV_PDS_BLOBSTORE_DIRECTORY'),
      },
      bsky: {
        port: bskyPort,
        publicUrl: bskyPublicUrl,
      },
      plc: {
        port: plcPort,
        dataDirectory: envStr(env, 'DEV_ENV_PLC_DIRECTORY'),
      },
      chat: { port: chatPort },
      ozone: {
        port: ozonePort,
        dbMaterializedViewRefreshIntervalMs: 30_000,
      },
      introspect: { port: introspectPort },
    },
    skipMockSetup: envBool(env, 'DEV_ENV_SKIP_MOCK_SETUP', false),
    skipParaDemoSeed: envBool(env, 'DEV_ENV_SKIP_PARA_DEMO_SEED', false),
  }
}
