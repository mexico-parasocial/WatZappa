import type { ServerEnvironment } from './env.js'

export const envToSecrets = (env: ServerEnvironment): ServerSecrets => {
  if (!env.jwtSecret) {
    throw new Error('Must provide a JWT secret')
  }

  if (!env.adminPassword) {
    throw new Error('Must provide an admin password')
  }

  // MVP hardening: enforce minimum secret strength in production.
  const isProd = !env.devMode
  if (isProd) {
    if (env.jwtSecret.length < 32) {
      throw new Error(
        'PDS_JWT_SECRET must be at least 32 characters in production',
      )
    }
    if (env.adminPassword.length < 12) {
      throw new Error(
        'PDS_ADMIN_PASSWORD must be at least 12 characters in production',
      )
    }
    if (!env.dpopSecret || env.dpopSecret.length < 32) {
      throw new Error(
        'PDS_DPOP_SECRET must be set and at least 32 characters in production',
      )
    }
  }

  return {
    dpopSecret: env.dpopSecret,
    jwtSecret: env.jwtSecret,
    adminPassword: env.adminPassword,
    plcRotationKey: envToPlcRotationKeyConfig(env),
    entrywayAdminToken: env.entrywayAdminToken ?? env.adminPassword,
  }
}

export type ServerSecrets = {
  dpopSecret?: string
  jwtSecret: string
  adminPassword: string
  plcRotationKey?: PlcRotationKeyConfig
  entrywayAdminToken?: string
}

export type PlcRotationKeyConfig = SigningKeyKms | SigningKeyMemory

export type SigningKeyKms = {
  provider: 'kms'
  keyId: string
}

export type SigningKeyMemory = {
  provider: 'memory'
  privateKeyHex: string
}

// @NOTE An AppContext override can supply the key without an environment secret.
function envToPlcRotationKeyConfig(
  env: ServerEnvironment,
): PlcRotationKeyConfig | undefined {
  if (env.plcRotationKeyKmsKeyId && env.plcRotationKeyK256PrivateKeyHex) {
    throw new Error('Cannot set both kms & memory keys for plc rotation key')
  } else if (env.plcRotationKeyKmsKeyId) {
    return { provider: 'kms', keyId: env.plcRotationKeyKmsKeyId }
  } else if (env.plcRotationKeyK256PrivateKeyHex) {
    return {
      provider: 'memory',
      privateKeyHex: env.plcRotationKeyK256PrivateKeyHex,
    }
  }
  return undefined
}
