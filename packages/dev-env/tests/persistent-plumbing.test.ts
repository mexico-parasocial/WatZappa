// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import {
  buildDevEnvRuntimeConfig,
  withoutPersistentPdsStorage,
} from '../src/config.js'

describe('persistent dev-env plumbing', () => {
  it('starts the persistent profile with isolated durable storage', () => {
    const makefile = fs.readFileSync(
      path.join(import.meta.dirname, '../../../Makefile'),
      'utf8',
    )
    const targetStart = makefile.indexOf('run-dev-env:')
    const targetEnd = makefile.indexOf('.PHONY: run-dev-env-logged')
    const target = makefile.slice(targetStart, targetEnd)

    expect(targetStart).toBeGreaterThanOrEqual(0)
    expect(target).toContain('./scripts/dev-env-persistent.sh')
    expect(makefile).toContain('run-demo-env:')
    expect(makefile).toContain(
      'NODE_ENV=development pnpm --filter @atproto/dev-env run start',
    )

    const launcher = fs.readFileSync(
      path.join(import.meta.dirname, '../../../scripts/dev-env-persistent.sh'),
      'utf8',
    )
    expect(launcher).toContain('.dev-env-data')
    expect(launcher).toContain(
      'DB_POSTGRES_URL=postgresql://pg:password@127.0.0.1:5434/postgres',
    )
    expect(launcher).toContain('REDIS_HOST=127.0.0.1:6381')
    expect(launcher).toContain('DB_POSTGRES_SCHEMA=para_local')
    expect(launcher).toContain('DEV_ENV_SKIP_PARA_DEMO_SEED=1')
    expect(launcher).toContain('DEV_ENV_SEED_MEMES_ON_START=1')
    expect(launcher).toContain('repair-dev-pds-migrations.mjs')
    expect(launcher).toContain('BRIDGE_DB_PATH="$DATA_DIR/bridge/bridge.db"')
    expect(launcher).toContain('tsconfig.build.json --force')
    expect(launcher).toContain('check-dev-migrations.mjs')
  })

  it('builds the default local network contract', () => {
    const cfg = buildDevEnvRuntimeConfig({})

    expect(cfg).toEqual({
      networkParams: {
        dbPostgresSchema: 'dev',
        pds: {
          port: 2583,
          hostname: 'localhost',
          enableDidDocWithSession: true,
          dataDirectory: undefined,
          blobstoreDiskLocation: undefined,
        },
        bsky: {
          port: 2584,
          publicUrl: 'http://localhost:2584',
        },
        plc: { port: 2582 },
        chat: { port: 2590 },
        ozone: {
          port: 2587,
          dbMaterializedViewRefreshIntervalMs: 30_000,
        },
        introspect: { port: 2581 },
      },
      skipMockSetup: false,
      skipParaDemoSeed: false,
      seedMemesOnStart: false,
    })
  })

  it('honors persistent storage, public identities, schema, and seed flags', () => {
    const cfg = buildDevEnvRuntimeConfig({
      DEV_ENV_PDS_PORT: '3583',
      DEV_ENV_BSKY_PORT: '3584',
      DEV_ENV_PLC_PORT: '3582',
      DEV_ENV_CHAT_PORT: '3590',
      DEV_ENV_OZONE_PORT: '3587',
      DEV_ENV_INTROSPECT_PORT: '3581',
      DEV_ENV_PDS_HOSTNAME: 'pds.example.test',
      DEV_ENV_BSKY_PUBLIC_URL: 'https://appview.example.test',
      DEV_ENV_ENABLE_DID_DOC_WITH_SESSION: 'false',
      DEV_ENV_PDS_DATA_DIRECTORY: '/srv/para/pds',
      DEV_ENV_PDS_BLOBSTORE_DIRECTORY: '/srv/para/blobs',
      DEV_ENV_SKIP_MOCK_SETUP: '1',
      DEV_ENV_SKIP_PARA_DEMO_SEED: 'true',
      DEV_ENV_SEED_MEMES_ON_START: '1',
      DB_POSTGRES_SCHEMA: 'shared_demo',
    })

    expect(cfg.networkParams).toMatchObject({
      dbPostgresSchema: 'shared_demo',
      pds: {
        port: 3583,
        hostname: 'pds.example.test',
        enableDidDocWithSession: false,
        dataDirectory: '/srv/para/pds',
        blobstoreDiskLocation: '/srv/para/blobs',
      },
      bsky: {
        port: 3584,
        publicUrl: 'https://appview.example.test',
      },
      plc: { port: 3582 },
      chat: { port: 3590 },
      ozone: {
        port: 3587,
        dbMaterializedViewRefreshIntervalMs: 30_000,
      },
      introspect: { port: 3581 },
    })
    expect(cfg.skipMockSetup).toBe(true)
    expect(cfg.skipParaDemoSeed).toBe(true)
    expect(cfg.seedMemesOnStart).toBe(true)
  })

  it('fails fast on malformed port overrides', () => {
    expect(() =>
      buildDevEnvRuntimeConfig({
        DEV_ENV_PDS_PORT: 'not-a-number',
      }),
    ).toThrow('DEV_ENV_PDS_PORT must be an integer')
  })

  it('does not pass main persistent PDS storage into the service-profile PDS', () => {
    const sanitized = withoutPersistentPdsStorage({
      port: 2583,
      hostname: 'localhost',
      dataDirectory: '/srv/para/pds',
      blobstoreDiskLocation: '/srv/para/blobs',
      accountDbLocation: '/srv/para/pds/account.sqlite',
      inviteRequired: false,
    })

    expect(sanitized).toEqual({
      port: 2583,
      hostname: 'localhost',
      inviteRequired: false,
    })
  })
})
