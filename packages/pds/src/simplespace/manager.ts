import type { SpaceRefString } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { ActorStore } from '../actor-store/actor-store.js'
import type { SpaceConfig } from '../actor-store/space/transactor.js'
import { toSpaceRef } from '../api/com/atproto/space/util.js'
import type { com } from '../lexicons/index.js'
import type { SpaceDeletionRecipient } from '../space-deletion-notifications.js'
import { lexAppAccessToDb, lexPolicyToDb, toLexConfig } from './config.js'

type LexPolicy = com.atproto.simplespace.createSpace.$InputBody['readPolicy']
type LexAppAccess = com.atproto.simplespace.createSpace.$InputBody['appAccess']

/**
 * The simplespace host, reduced from the reference PDS (see packages/space/SOURCE)
 * to what an owner-only space needs: create, read, reconfigure and delete it. This
 * server issues no space credentials and adds no members yet, so the only policy
 * it accepts is a member list; a public or managing-app policy would promise
 * readers it cannot serve, and would open the space the day credentials ship.
 */
export class SimpleSpaceManager {
  constructor(public actorStore: ActorStore) {}

  async createSpace(
    space: SpaceRefString,
    input: {
      readPolicy: LexPolicy
      writePolicy: LexPolicy
      appAccess: LexAppAccess
    },
  ): Promise<void> {
    const { spaceDid } = toSpaceRef(space)
    const read = memberListOnly(input.readPolicy)
    const write = memberListOnly(input.writePolicy)
    const config = {
      readPolicy: read.policy,
      readManagingApp: read.managingApp,
      writePolicy: write.policy,
      writeManagingApp: write.managingApp,
      ...lexAppAccessToDb(input.appAccess),
    }
    await this.actorStore.ensureLatestSchema(spaceDid)
    await this.actorStore.transact(spaceDid, async (actorTxn) => {
      const existing = await actorTxn.space.getSpaceConfig(space)
      if (existing) {
        throw new InvalidRequestError(
          'Space already exists',
          'SpaceAlreadyExists',
        )
      }
      await actorTxn.space.createSpace(space, config)
    })
  }

  async updateSpace(
    space: SpaceRefString,
    input: {
      readPolicy?: LexPolicy
      writePolicy?: LexPolicy
      appAccess?: LexAppAccess
    },
  ): Promise<void> {
    const { spaceDid } = toSpaceRef(space)
    const config: Partial<SpaceConfig> = {}
    if (input.readPolicy) {
      const read = memberListOnly(input.readPolicy)
      config.readPolicy = read.policy
      config.readManagingApp = read.managingApp
    }
    if (input.writePolicy) {
      const write = memberListOnly(input.writePolicy)
      config.writePolicy = write.policy
      config.writeManagingApp = write.managingApp
    }
    if (input.appAccess) {
      const appAccess = lexAppAccessToDb(input.appAccess)
      config.appAccessType = appAccess.appAccessType
      config.appAllowed = appAccess.appAllowed
    }
    await this.actorStore.ensureLatestSchema(spaceDid)
    await this.actorStore.transact(spaceDid, async (actorTxn) => {
      await actorTxn.space.getActiveSpaceConfig(space)
      await actorTxn.space.updateSpaceConfig(space, config)
    })
  }

  async getSpace(space: SpaceRefString) {
    const { spaceDid } = toSpaceRef(space)
    await this.actorStore.ensureLatestSchema(spaceDid)
    const config = await this.actorStore.read(spaceDid, (store) =>
      store.space.getActiveSpaceConfig(space),
    )
    return toLexConfig(config)
  }

  /**
   * Deletes the owner's own repo in the space along with it. The space row stays
   * as a tombstone. Capture registrations before the transaction removes them.
   */
  async deleteSpace(space: SpaceRefString): Promise<{
    status: 'deleted' | 'absent'
    recipients: SpaceDeletionRecipient[]
  }> {
    const { spaceDid } = toSpaceRef(space)
    await this.actorStore.ensureLatestSchema(spaceDid)
    return this.actorStore.transact(spaceDid, async (actorTxn) => {
      const row = await actorTxn.space.getSpace(space)
      if (!row) return { status: 'absent', recipients: [] }
      const recipients = await actorTxn.space.getCredentialRecipients(space)
      if (!row.deletedAt) await actorTxn.space.deleteSpace(space)
      return { status: 'deleted', recipients }
    })
  }
}

function memberListOnly(policy: LexPolicy) {
  const db = lexPolicyToDb(policy)
  if (db.policy !== 'member-list') {
    throw new InvalidRequestError(
      'Only a member-list policy is supported on this server yet',
      'UnsupportedPolicy',
    )
  }
  return db
}
