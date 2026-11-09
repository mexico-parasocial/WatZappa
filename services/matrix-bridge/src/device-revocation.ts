import type { Logger } from 'pino'
import type { IBridgeDatabase } from './db/index.js'
import type { DeviceSession } from './db/records.js'
import type { MatrixAdminClient } from './matrix.js'

/** Persist intent before contacting MAS/Synapse; completion is database-atomic. */
export async function requestDeviceRevocation(
  db: IBridgeDatabase,
  matrix: Pick<MatrixAdminClient, 'adminDeactivateDevice'>,
  session: DeviceSession,
): Promise<void> {
  await db.queueDeviceRevocation(session.did, session.id)
  await matrix.adminDeactivateDevice(session.mxid, session.deviceId)
  await db.transaction(async () => {
    await db.revokeDeviceSession(session.did, session.id)
    await db.deleteDeviceRevocation(session.id)
  })
}

/** Retry a bounded batch without discarding security work after repeated outages. */
export async function retryDeviceRevocations(
  db: IBridgeDatabase,
  matrix: Pick<MatrixAdminClient, 'adminDeactivateDevice'>,
  log: Pick<Logger, 'warn'>,
): Promise<void> {
  for (const session of await db.getPendingDeviceRevocations(50)) {
    try {
      await requestDeviceRevocation(db, matrix, session)
    } catch (err) {
      await db.incrementDeviceRevocationAttempts(session.id)
      log.warn(
        { err, sessionId: session.id },
        'Device revocation still pending',
      )
    }
  }
}

/** Serializes drains and waits for in-flight revocations before closing storage. */
export class DeviceRevocationWorker {
  private timer?: NodeJS.Timeout
  private running?: Promise<void>
  constructor(
    private db: IBridgeDatabase,
    private matrix: Pick<MatrixAdminClient, 'adminDeactivateDevice'>,
    private log: Pick<Logger, 'warn'>,
  ) {}

  private drain(): void {
    if (this.running) return
    this.running = retryDeviceRevocations(this.db, this.matrix, this.log)
      .catch((err) => this.log.warn({ err }, 'Device revocation retry failed'))
      .finally(() => {
        this.running = undefined
      })
  }

  start(): void {
    this.drain()
    this.timer = setInterval(() => this.drain(), 60_000)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    await this.running
  }
}
