import { getDb, getMigrator } from '../src/actor-store/db/index.js'
import { migrateLegacyPolicy } from '../src/simplespace/migrate-policy.js'

describe('legacy Spaces policy conversion', () => {
  const legacy = {
    uri: 'at://did:plc:owner/space/com.example.group/one',
    readPolicy: 'member-list',
    readManagingApp: null,
    writePolicy: 'member-list',
    writeManagingApp: null,
    appAccessType: 'open',
    appAllowed: '[]',
  }

  it('retains private access and unpublished state', () => {
    expect(migrateLegacyPolicy(legacy)).toEqual({
      $type: 'com.atproto.memberspace.policy',
      publicRead: false,
      publicWrite: false,
      publishPolicy: false,
      publishMembers: false,
    })
  })

  it('preserves the allowed client list, including an empty list', () => {
    expect(
      migrateLegacyPolicy({
        ...legacy,
        appAccessType: 'allowList',
        appAllowed: '["https://app.example"]',
      }).allowedApps,
    ).toEqual(['https://app.example'])
    expect(
      migrateLegacyPolicy({ ...legacy, appAccessType: 'allowList' })
        .allowedApps,
    ).toEqual([])
  })

  it.each([
    { readPolicy: 'public' },
    { writePolicy: 'managing-app', writeManagingApp: 'did:web:app.example' },
    { appAccessType: 'unknown' },
    { appAllowed: '[1]' },
    { appAllowed: '["https://unexpected.example"]' },
  ])('rejects unsupported or inconsistent legacy state: %j', (changes) => {
    expect(() => migrateLegacyPolicy({ ...legacy, ...changes })).toThrow()
  })

  it('migrates existing policy and preserves the legacy configuration and members', async () => {
    const db = getDb(':memory:')
    try {
      await getMigrator(db).migrateToOrThrow('005')
      await db.db
        .insertInto('simplespace_config')
        .values({
          ...legacy,
          appAccessType: 'allowList',
          appAllowed: '["https://app.example"]',
        })
        .execute()
      await db.db
        .insertInto('simplespace_member')
        .values({
          space: legacy.uri,
          did: 'did:web:member.example',
          read: 1,
          write: 0,
        })
        .execute()
      await getMigrator(db).migrateToLatestOrThrow()
      const saved = await db.db
        .selectFrom('space_policy')
        .selectAll()
        .where('uri', '=', legacy.uri)
        .executeTakeFirstOrThrow()
      expect(JSON.parse(saved.policyJson)).toEqual(
        migrateLegacyPolicy({
          ...legacy,
          appAccessType: 'allowList',
          appAllowed: '["https://app.example"]',
        }),
      )
      expect(
        await db.db.selectFrom('simplespace_config').selectAll().execute(),
      ).toHaveLength(1)
      expect(
        await db.db.selectFrom('simplespace_member').selectAll().execute(),
      ).toHaveLength(1)
    } finally {
      await db.close()
    }
  })

  it('rolls back the migration when legacy policy would loosen access', async () => {
    const db = getDb(':memory:')
    try {
      await getMigrator(db).migrateToOrThrow('005')
      await db.db
        .insertInto('simplespace_config')
        .values({ ...legacy, readPolicy: 'public' })
        .execute()
      await expect(getMigrator(db).migrateToLatestOrThrow()).rejects.toThrow(
        'Unsupported legacy Spaces policy',
      )
      expect(
        (
          await db.db
            .selectFrom('simplespace_config')
            .selectAll()
            .executeTakeFirstOrThrow()
        ).readPolicy,
      ).toBe('public')
      const tables = await db.db.introspection.getTables()
      expect(tables.some((table) => table.name === 'space_policy')).toBe(false)
    } finally {
      await db.close()
    }
  })
})
