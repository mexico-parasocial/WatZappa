import type { DevEnvRuntimeConfig } from './config.js'
import {
  DevIdentityProvider,
  type DevIdentitySeed,
  defaultDevIdentityProvider,
} from './identity.js'
import type { TestNetwork } from './network.js'

export type DevEnvManifest = {
  version: 1
  generatedAt: string
  database: {
    postgresSchema?: string
  }
  seed: {
    minimalMockSetup: 'enabled' | 'skipped'
    paraDemo: 'enabled' | 'skipped'
  }
  persistence: {
    pdsDataDirectory?: string
    pdsBlobstoreDirectory?: string
    plcDirectory?: string
  }
  identities: Array<
    Omit<DevIdentitySeed, 'privateKeyHex'> & {
      secretRef: string
      privateKeyMaterial: 'dev-only'
    }
  >
  services: Array<{
    name: string
    url: string
    port: number
    did?: string
    handle?: string
    dependencies?: string[]
  }>
}

export const createDevEnvManifest = (
  network: TestNetwork,
  runtimeConfig: DevEnvRuntimeConfig,
  identityProvider: DevIdentityProvider = defaultDevIdentityProvider,
): DevEnvManifest => {
  const networkParams = runtimeConfig.networkParams

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    database: {
      postgresSchema: networkParams.dbPostgresSchema,
    },
    seed: {
      minimalMockSetup: runtimeConfig.skipMockSetup ? 'skipped' : 'enabled',
      paraDemo: runtimeConfig.skipParaDemoSeed ? 'skipped' : 'enabled',
    },
    persistence: {
      pdsDataDirectory: networkParams.pds?.dataDirectory,
      pdsBlobstoreDirectory: networkParams.pds?.blobstoreDiskLocation,
      plcDirectory: networkParams.plc?.dataDirectory,
    },
    identities: identityProvider.manifestIdentities().map((identity) => ({
      name: identity.name,
      mode: identity.mode,
      secretRef: `dev-env:${identity.name}`,
      privateKeyMaterial: 'dev-only',
    })),
    services: [
      {
        name: 'plc',
        url: network.plc.url,
        port: network.plc.port,
      },
      {
        name: 'pds',
        url: network.pds.url,
        port: network.pds.port,
        did: network.pds.ctx.cfg.service.did,
        handle: network.pds.ctx.cfg.service.hostname,
        dependencies: ['plc'],
      },
      {
        name: 'bsky',
        url: network.bsky.url,
        port: network.bsky.port,
        did: network.bsky.serverDid,
        handle: 'bsky.test',
        dependencies: ['pds', 'plc', 'dataplane', 'bsync', 'redis', 'postgres'],
      },
      {
        name: 'dataplane',
        url: network.bsky.ctx.cfg.dataplaneUrls[0],
        port: portFromUrl(network.bsky.ctx.cfg.dataplaneUrls[0]),
        dependencies: ['postgres', 'plc'],
      },
      {
        name: 'ozone',
        url: network.ozone.url,
        port: network.ozone.port,
        did: network.ozone.ctx.cfg.service.did,
        dependencies: ['pds', 'bsky', 'plc', 'postgres'],
      },
      {
        name: 'chat',
        url: network.chat.url,
        port: network.chat.port,
        did: network.chat.did,
        handle: 'chat.test',
        dependencies: ['plc'],
      },
      ...(network.introspect
        ? [
            {
              name: 'introspect',
              url: `http://localhost:${network.introspect.port}`,
              port: network.introspect.port,
              dependencies: ['pds', 'bsky', 'ozone', 'plc'],
            },
          ]
        : []),
    ],
  }
}

const portFromUrl = (url: string): number => {
  const parsed = new URL(url)
  return Number(parsed.port)
}
