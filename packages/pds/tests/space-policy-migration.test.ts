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
})
