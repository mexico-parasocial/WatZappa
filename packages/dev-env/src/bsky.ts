import * as plc from '@did-plc/lib'
import { Client as PlcClient } from '@did-plc/lib'
import getPort from 'get-port'
import * as ui8 from 'uint8arrays'
import { AtpAgent } from '@atproto/api'
import * as bsky from '@atproto/bsky'
import { Secp256k1Keypair } from '@atproto/crypto'
import { Client } from '@atproto/lex'
import { ADMIN_PASSWORD, EXAMPLE_LABELER } from './const.js'
import { defaultDevIdentityProvider } from './identity.js'
import { BskyConfig } from './types.js'
export * from '@atproto/bsky'

export class TestBsky {
  constructor(
    public url: string,
    public port: number,
    public db: bsky.Database,
    public server: bsky.BskyAppView,
    public dataplane: bsky.DataPlaneServer,
    public bsync: bsky.MockBsync,
    public sub: bsky.RepoSubscription,
    public serverDid: string,
  ) {}

  static async create(cfg: BskyConfig): Promise<TestBsky> {
    const serviceKeypair = cfg.privateKey
      ? await Secp256k1Keypair.import(cfg.privateKey)
      : await defaultDevIdentityProvider.keypair('bsky')
    const plcClient = new PlcClient(cfg.plcUrl)

    const port = cfg.port || (await getPort())
    const url = `http://localhost:${port}`
    const handle = 'bsky.test'
    const plcOp = await plc.signOperation(
      {
        type: 'plc_operation',
        verificationMethods: {
          atproto: serviceKeypair.did(),
        },
        rotationKeys: [serviceKeypair.did()],
        alsoKnownAs: [`at://${handle}`],
        services: {
          atproto_pds: {
            type: 'AtprotoPersonalDataServer',
            endpoint: `http://localhost:${port}`,
          },
        },
        prev: null,
      },
      serviceKeypair,
    )
    const serverDid = await plc.didForCreateOp(plcOp)
    try {
      await plcClient.getDocument(serverDid)
    } catch (e) {
      await plcClient.sendOperation(serverDid, plcOp)
    }

    const endpoint = `http://localhost:${port}`

    const doc = await plcClient.getDocument(serverDid)
    const hasServices = doc.service?.some((s) =>
      ['#bsky_notif', '#bsky_appview'].includes(s.id),
    )

    if (!hasServices) {
      await plcClient.updateData(serverDid, serviceKeypair, (x) => {
        x.services['bsky_notif'] = {
          type: 'BskyNotificationService',
          endpoint,
        }
        x.services['bsky_appview'] = {
          type: 'BskyAppView',
          endpoint,
        }
        return x
      })
    }

    // shared across server, ingester, and indexer in order to share pool, avoid too many pg connections.
    const db = new bsky.Database({
      url: cfg.dbPostgresUrl,
      schema: cfg.dbPostgresSchema,
      poolSize: 10,
    })

    const dataplanePort = await getPort()
    const dataplane = await bsky.DataPlaneServer.create(
      db,
      dataplanePort,
      cfg.plcUrl,
    )

    const bsyncPort = await getPort()
    const bsync = await bsky.MockBsync.create(db, bsyncPort)

    const config = new bsky.ServerConfig({
      version: 'unknown',
      port,
      didPlcUrl: cfg.plcUrl,
      publicUrl: 'https://bsky.public.url',
      serverDid,
      alternateAudienceDids: [],
      dataplaneUrls: [`http://localhost:${dataplanePort}`],
      dataplaneHttpVersion: '1.1',
      bsyncUrl: `http://localhost:${bsyncPort}`,
      bsyncHttpVersion: '1.1',
      modServiceDid: cfg.modServiceDid ?? 'did:example:invalidMod',
      labelsFromIssuerDids: [EXAMPLE_LABELER],
      bigThreadUris: new Set(),
      maxThreadParents: cfg.maxThreadParents ?? 50,
      disableSsrfProtection: true,
      searchTagsHide: new Set(),
      threadTagsBumpDown: new Set(),
      threadTagsHide: new Set(),
      visibilityTagHide: '',
      visibilityTagRankPrefix: '',
      debugFieldAllowedDids: new Set(),
      draftsLimit: 500,
      communityCreatorDids: [],
      ...cfg,
      adminPasswords: [ADMIN_PASSWORD],
      etcdHosts: [],
    })

    // Separate migration db in case migration changes some connection state that we need in the tests, e.g. "alter database ... set ..."
    const migrationDb = new bsky.Database({
      url: cfg.dbPostgresUrl,
      schema: cfg.dbPostgresSchema,
    })
    if (cfg.migration) {
      await migrationDb.migrateToOrThrow(cfg.migration)
    } else {
      await migrationDb.migrateToLatestOrThrow()
    }
    await migrationDb.close()

    // api server
    const server = bsky.BskyAppView.create({
      config,
      signingKey: serviceKeypair,
    })

    const sub = new bsky.RepoSubscription({
      service: cfg.repoProvider,
      db,
      idResolver: dataplane.idResolver,
    })

    await server.start()

    sub.start()

    return new TestBsky(url, port, db, server, dataplane, bsync, sub, serverDid)
  }

  get ctx(): bsky.AppContext {
    return this.server.ctx
  }

  getAgent(): AtpAgent {
    const agent = new AtpAgent({ service: this.url })
    agent.configureLabelers([EXAMPLE_LABELER])
    return agent
  }

  getClient(): Client {
    const client = new Client({ service: this.url })
    client.setLabelers([EXAMPLE_LABELER])
    return client
  }

  adminAuth(): string {
    const [password] = this.ctx.cfg.adminPasswords
    return (
      'Basic ' +
      ui8.toString(ui8.fromString(`admin:${password}`, 'utf8'), 'base64pad')
    )
  }

  adminAuthHeaders() {
    return {
      authorization: this.adminAuth(),
    }
  }

  async close() {
    await this.server.destroy()
    await this.bsync.destroy()
    await this.dataplane.destroy()
    await this.sub.destroy()
    await this.db.close()
  }
}
