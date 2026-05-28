import fs from 'node:fs/promises'
import path from 'node:path'
import * as ui8 from 'uint8arrays'
import { Secp256k1Keypair } from '@atproto/crypto'
import {
  DEV_ADMIN_HEX,
  DEV_BSKY_HEX,
  DEV_CHAT_HEX,
  DEV_MODERATOR_HEX,
  DEV_OZONE_HEX,
  DEV_TRIAGE_HEX,
} from './const.js'

export type DevIdentityName =
  | 'bsky'
  | 'chat'
  | 'ozone'
  | 'ozoneAdmin'
  | 'ozoneModerator'
  | 'ozoneTriage'

export type DevIdentityMode = 'stable' | 'ephemeral' | 'persistentFromDisk'

export type DevIdentitySeed = {
  name: DevIdentityName
  mode: DevIdentityMode
  privateKeyHex?: string
}

const STABLE_IDENTITIES: Record<DevIdentityName, string> = {
  bsky: DEV_BSKY_HEX,
  chat: DEV_CHAT_HEX,
  ozone: DEV_OZONE_HEX,
  ozoneAdmin: DEV_ADMIN_HEX,
  ozoneModerator: DEV_MODERATOR_HEX,
  ozoneTriage: DEV_TRIAGE_HEX,
}

export class DevIdentityProvider {
  private persistentSeeds = new Map<DevIdentityName, string>()

  constructor(
    readonly opts: {
      mode?: DevIdentityMode
      directory?: string
    } = {},
  ) {}

  get mode(): DevIdentityMode {
    return this.opts.mode ?? 'stable'
  }

  stablePrivateKeyHex(name: DevIdentityName): string {
    return STABLE_IDENTITIES[name]
  }

  seed(name: DevIdentityName): DevIdentitySeed {
    if (this.mode === 'stable') {
      return {
        name,
        mode: 'stable',
        privateKeyHex: this.stablePrivateKeyHex(name),
      }
    }

    return {
      name,
      mode: this.mode,
    }
  }

  async keypair(name: DevIdentityName): Promise<Secp256k1Keypair> {
    if (this.mode === 'ephemeral') {
      return Secp256k1Keypair.create({ exportable: true })
    }

    if (this.mode === 'persistentFromDisk') {
      const privateKeyHex = await this.persistentPrivateKeyHex(name)
      return Secp256k1Keypair.import(ui8.fromString(privateKeyHex, 'hex'), {
        exportable: true,
      })
    }

    return Secp256k1Keypair.import(
      ui8.fromString(this.stablePrivateKeyHex(name), 'hex'),
      { exportable: true },
    )
  }

  async privateKeyHex(name: DevIdentityName): Promise<string> {
    if (this.mode === 'ephemeral') {
      const key = await Secp256k1Keypair.create({ exportable: true })
      return ui8.toString(await key.export(), 'hex')
    }

    if (this.mode === 'persistentFromDisk') {
      return this.persistentPrivateKeyHex(name)
    }

    return this.stablePrivateKeyHex(name)
  }

  manifestIdentities(): DevIdentitySeed[] {
    return (Object.keys(STABLE_IDENTITIES) as DevIdentityName[]).map((name) =>
      this.seed(name),
    )
  }

  private async persistentPrivateKeyHex(
    name: DevIdentityName,
  ): Promise<string> {
    const cached = this.persistentSeeds.get(name)
    if (cached) return cached

    if (!this.opts.directory) {
      throw new Error(
        'DevIdentityProvider persistentFromDisk mode requires a directory',
      )
    }

    const filePath = path.join(this.opts.directory, `${name}.key`)
    try {
      const existing = (await fs.readFile(filePath, 'utf8')).trim()
      this.persistentSeeds.set(name, existing)
      return existing
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err
    }

    const key = await Secp256k1Keypair.create({ exportable: true })
    const privateKeyHex = ui8.toString(await key.export(), 'hex')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${privateKeyHex}\n`, { mode: 0o600 })
    this.persistentSeeds.set(name, privateKeyHex)
    return privateKeyHex
  }
}

export const defaultDevIdentityProvider = new DevIdentityProvider()
