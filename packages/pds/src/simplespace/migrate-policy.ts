import type { SimplespaceConfig } from '../actor-store/db/index.js'
import { com } from '../lexicons/index.js'

/** Convert only policies the PARA host actually enforced; unknown states fail closed. */
export function migrateLegacyPolicy(config: SimplespaceConfig) {
  if (
    config.readPolicy !== 'member-list' ||
    config.writePolicy !== 'member-list' ||
    config.readManagingApp !== null ||
    config.writeManagingApp !== null
  ) {
    throw new Error('Unsupported legacy Spaces policy')
  }

  const allowed: unknown = JSON.parse(config.appAllowed)
  if (
    !Array.isArray(allowed) ||
    !allowed.every((item) => typeof item === 'string')
  ) {
    throw new Error('Invalid legacy Spaces app allow-list')
  }
  if (config.appAccessType !== 'open' && config.appAccessType !== 'allowList') {
    throw new Error('Unsupported legacy Spaces app access')
  }
  if (config.appAccessType === 'open' && allowed.length !== 0) {
    throw new Error('Conflicting legacy Spaces app access')
  }

  return com.atproto.memberspace.policy.$build({
    publicRead: false,
    publicWrite: false,
    publishPolicy: false,
    publishMembers: false,
    ...(config.appAccessType === 'allowList' ? { allowedApps: allowed } : {}),
  })
}
