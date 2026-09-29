import events from 'node:events'
import http from 'node:http'
import express from 'express'
import type { TestBsky } from './bsky.js'
import type { TestChat } from './chat.js'
import type { TestOzone } from './ozone.js'
import type { TestPds } from './pds.js'
import type { TestPlc } from './plc.js'

/*
 * What the introspection server reports. Local tooling reads service DIDs
 * from here instead of hard-coding them (e.g. WatZappa
 * scripts/sync-local-dev-service.sh writes `bsky.did` and `chat.did` into
 * PARA's env as its atproto-proxy targets), so keep these keys stable.
 */
export function introspectionPayload(services: {
  plc: TestPlc
  pds: TestPds
  bsky: TestBsky
  ozone: TestOzone
  chat?: TestChat
}) {
  const { plc, pds, bsky, ozone, chat } = services
  return {
    plc: {
      url: plc.url,
    },
    pds: {
      url: pds.url,
      did: pds.ctx.cfg.service.did,
    },
    bsky: {
      url: bsky.url,
      did: bsky.ctx.cfg.serverDid,
    },
    ozone: {
      url: ozone.url,
      did: ozone.ctx.cfg.service.did,
    },
    ...(chat
      ? {
          chat: {
            url: chat.url,
            did: chat.did,
          },
        }
      : {}),
    db: {
      url: ozone.ctx.cfg.db.postgresUrl,
    },
  }
}

export class IntrospectServer {
  constructor(
    public port: number,
    public server: http.Server,
  ) {}

  static async start(
    port: number,
    plc: TestPlc,
    pds: TestPds,
    bsky: TestBsky,
    ozone: TestOzone,
    chat?: TestChat,
  ) {
    const app = express()
    app.get('/', (_req, res) => {
      res
        .status(200)
        .send(introspectionPayload({ plc, pds, bsky, ozone, chat }))
    })
    const server = app.listen(port)
    await events.once(server, 'listening')
    return new IntrospectServer(port, server)
  }

  async close() {
    this.server.close()
    await events.once(this.server, 'close')
  }
}
