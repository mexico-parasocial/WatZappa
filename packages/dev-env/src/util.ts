import * as plc from '@did-plc/lib'
import axios from 'axios'
import * as ui8 from 'uint8arrays'
import { request } from 'undici'
import { Secp256k1Keypair } from '@atproto/crypto'
import { IdResolver } from '@atproto/identity'
import { TestBsky } from './bsky.js'
import { TestPds } from './pds.js'
import { DidAndKey } from './types.js'

export const mockNetworkUtilities = (pds: TestPds, bsky?: TestBsky) => {
  mockResolvers(pds.ctx.idResolver, pds)
  if (bsky) {
    mockResolvers(bsky.ctx.idResolver, pds)
    mockResolvers(bsky.dataplane.idResolver, pds)
  }
}

export const mockResolvers = (idResolver: IdResolver, pds: TestPds) => {
  // Map pds public url to its local url when resolving from plc
  const origResolveDid = idResolver.did.resolveNoCache
  idResolver.did.resolveNoCache = async (did: string) => {
    const result = await (origResolveDid.call(
      idResolver.did,
      did,
    ) as ReturnType<typeof origResolveDid>)
    const service = result?.service?.find((svc) => svc.id === '#atproto_pds')
    if (typeof service?.serviceEndpoint === 'string') {
      service.serviceEndpoint = service.serviceEndpoint.replace(
        pds.ctx.cfg.service.publicUrl,
        `http://localhost:${pds.port}`,
      )
    }
    return result
  }

  const origResolveHandleDns = idResolver.handle.resolveDns
  idResolver.handle.resolve = async (handle: string) => {
    const isPdsHandle = pds.ctx.cfg.identity.serviceHandleDomains.some(
      (domain) => handle.endsWith(domain),
    )
    if (!isPdsHandle) {
      return origResolveHandleDns.call(idResolver.handle, handle)
    }

    const url = new URL(`/.well-known/atproto-did`, pds.url)
    try {
      const res = await request(url, { headers: { host: handle } })
      if (res.statusCode !== 200) {
        await res.body.dump()
        return undefined
      }

      return res.body.text()
    } catch (err) {
      return undefined
    }
  }
}

export const mockMailer = (pds: TestPds) => {
  const mailer = pds.ctx.mailer
  const _origSendMail = mailer.transporter.sendMail
  mailer.transporter.sendMail = async (opts) => {
    const result = await _origSendMail.call(mailer.transporter, opts)
    console.log(`✉️ Email: ${JSON.stringify(result, null, 2)}`)
    return result
  }
}

const usedLockIds = new Set()
export const uniqueLockId = () => {
  let lockId: number
  do {
    lockId = 1000 + Math.ceil(1000 * Math.random())
  } while (usedLockIds.has(lockId))
  usedLockIds.add(lockId)
  return lockId
}

export const resolveHandleInPlc = async (
  plcUrl: string,
  handle: string,
): Promise<string | undefined> => {
  try {
    const res = await axios.get(`${plcUrl}/handle/${handle}`)
    return res.data.did
  } catch (e) {
    return undefined
  }
}

export const createDidAndKey = async (opts: {
  plcUrl: string
  handle: string
  pds: string
  keyHex?: string
}): Promise<DidAndKey> => {
  const { plcUrl, handle, pds, keyHex } = opts
  const key = keyHex
    ? await Secp256k1Keypair.import(ui8.fromString(keyHex, 'hex'))
    : await Secp256k1Keypair.create({ exportable: true })

  const plcClient = new plc.Client(plcUrl)
  const plcOp = await plc.signOperation(
    {
      type: 'plc_operation',
      verificationMethods: {
        atproto: key.did(),
      },
      rotationKeys: [key.did()],
      alsoKnownAs: [`at://${handle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: pds,
        },
      },
      prev: null,
    },
    key,
  )
  const did = await plc.didForCreateOp(plcOp)

  try {
    await plcClient.getDocument(did)
  } catch (e) {
    await plcClient.sendOperation(did, plcOp)
  }

  return {
    key,
    did,
  }
}
