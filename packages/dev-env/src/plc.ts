import fs from 'node:fs/promises'
import path from 'node:path'
import { Client as PlcClient } from '@did-plc/lib'
import * as plc from '@did-plc/server'
import getPort from 'get-port'
import { CID } from 'multiformats/cid'
import { PlcConfig } from './types.js'

export class PersistentMockDatabase implements plc.PlcDatabase {
  mock: plc.PlcDatabase
  constructor(public filePath: string) {
    this.mock = plc.Database.mock()
  }

  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(data)
      // Convert dates and CIDs back to proper objects
      for (const did in parsed) {
        for (const op of parsed[did]) {
          op.createdAt = new Date(op.createdAt)
          if (op.cid && typeof op.cid === 'string') {
            op.cid = CID.parse(op.cid)
          } else if (op.cid && typeof op.cid === 'object') {
            // Handle cases where it might have been saved as an object previously
            if (op.cid['/']) {
              op.cid = CID.parse(op.cid['/'])
            } else {
              // Try to reconstruct from parts if possible, but safest to just log or ignore
              // For now, let's just assume we'll fix the save() and start clean
            }
          }
        }
      }
      ;(this.mock as any).contents = parsed
    } catch (e) {
      // ignore if file doesn't exist
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const contents = (this.mock as any).contents
    const toSave: any = {}
    for (const did in contents) {
      toSave[did] = contents[did].map((op: any) => ({
        ...op,
        cid: op.cid.toString(),
      }))
    }
    await fs.writeFile(this.filePath, JSON.stringify(toSave, null, 2))
  }

  async close(): Promise<void> {
    return this.mock.close()
  }
  async healthCheck(): Promise<void> {
    return this.mock.healthCheck()
  }
  async validateAndAddOp(did: string, proposed: any): Promise<void> {
    await this.mock.validateAndAddOp(did, proposed)
    await this.save()
  }
  async opsForDid(did: string): Promise<any[]> {
    return this.mock.opsForDid(did)
  }
  async indexedOpsForDid(did: string, includeNull?: boolean): Promise<any[]> {
    return this.mock.indexedOpsForDid(did, includeNull)
  }
  async lastOpForDid(did: string): Promise<any> {
    return this.mock.lastOpForDid(did)
  }
  async exportOps(count: number, after?: Date): Promise<any[]> {
    return this.mock.exportOps(count, after)
  }
}

export class TestPlc {
  constructor(
    public url: string,
    public port: number,
    public server: plc.PlcServer,
  ) {}

  static async create(cfg: PlcConfig): Promise<TestPlc> {
    let db: plc.PlcDatabase
    if (cfg.dataDirectory) {
      const persistentDb = new PersistentMockDatabase(
        path.join(cfg.dataDirectory, 'plc.json'),
      )
      await persistentDb.load()
      db = persistentDb
    } else {
      db = plc.Database.mock()
    }
    const port = cfg.port || (await getPort())
    const url = `http://localhost:${port}`
    const server = plc.PlcServer.create({ db, port, ...cfg })
    await server.start()
    return new TestPlc(url, port, server)
  }

  get ctx(): plc.AppContext {
    return this.server.ctx
  }

  getClient(): PlcClient {
    return new PlcClient(this.url)
  }

  async close() {
    await this.server.destroy()
  }
}
