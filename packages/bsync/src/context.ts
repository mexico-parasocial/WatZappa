import { EventEmitter } from 'node:events'

import { ServerConfig } from './config.js'
import { Database } from './db/index.js'
import { createMuteOpChannel } from './db/schema/mute_op.js'
import { createNotifOpChannel } from './db/schema/notif_op.js'
import { createOperationChannel } from './db/schema/operation.js'

export type AppContextOptions = {
  db: Database
  cfg: ServerConfig
  shutdown: AbortSignal
}

export class AppContext {
  db: Database
  cfg: ServerConfig
  shutdown: AbortSignal
  events: AppEventsEmitter

  constructor(opts: AppContextOptions) {
    this.db = opts.db
    this.cfg = opts.cfg
    this.shutdown = opts.shutdown
    this.events = new EventEmitter() as AppEventsEmitter
  }

  static async fromConfig(
    cfg: ServerConfig,
    shutdown: AbortSignal,
    overrides?: Partial<AppContextOptions>,
  ): Promise<AppContext> {
    const db = new Database({
      url: cfg.db.url,
      schema: cfg.db.schema,
      poolSize: cfg.db.poolSize,
      poolMaxUses: cfg.db.poolMaxUses,
      poolIdleTimeoutMs: cfg.db.poolIdleTimeoutMs,
    })
    return new AppContext({ db, cfg, shutdown, ...overrides })
  }
}

export type AppEvents = {
  [createMuteOpChannel]: () => void
  [createNotifOpChannel]: () => void
  [createOperationChannel]: () => void
}

export interface AppEventsEmitter extends EventEmitter {
  emit<E extends keyof AppEvents>(
    event: E,
    ...args: Parameters<AppEvents[E]>
  ): boolean
  on<E extends keyof AppEvents>(event: E, listener: AppEvents[E]): this
  off<E extends keyof AppEvents>(event: E, listener: AppEvents[E]): this
}
