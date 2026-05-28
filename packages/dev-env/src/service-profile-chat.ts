import * as plc from '@did-plc/lib'
import { Secp256k1Keypair } from '@atproto/crypto'
import { defaultDevIdentityProvider } from './identity.js'

export class ChatServiceProfile {
  constructor(
    readonly did: string,
    readonly key: Secp256k1Keypair,
    readonly publicUrl: string,
  ) {}

  static async create(opts: {
    plcUrl: string
    publicUrl: string
    handle?: string
    privateKey?: string
  }) {
    const plcClient = new plc.Client(opts.plcUrl)
    const key = await Secp256k1Keypair.import(
      opts.privateKey ??
        (await defaultDevIdentityProvider.privateKeyHex('chat')),
    )
    const handle = opts.handle ?? 'chat.test'

    const plcOp = await plc.signOperation(
      {
        type: 'plc_operation',
        rotationKeys: [key.did()],
        alsoKnownAs: [`at://${handle}`],
        verificationMethods: {
          atproto: key.did(),
        },
        services: {
          bsky_chat: {
            type: 'BskyChatService',
            endpoint: opts.publicUrl,
          },
        },
        prev: null,
      },
      key,
    )
    const did = await plc.didForCreateOp(plcOp)

    try {
      await plcClient.getDocument(did)
    } catch {
      await plcClient.sendOperation(did, plcOp)
    }

    await plcClient.updateData(did, key, (doc) => {
      doc.alsoKnownAs = [`at://${handle}`]
      doc.verificationMethods = {
        ...(doc.verificationMethods ?? {}),
        atproto: key.did(),
      }
      doc.services = {
        ...(doc.services ?? {}),
        bsky_chat: {
          type: 'BskyChatService',
          endpoint: opts.publicUrl,
        },
      }
      return doc
    })

    return new ChatServiceProfile(did, key, opts.publicUrl)
  }
}
