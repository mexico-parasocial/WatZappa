import { timingSafeEqual } from 'node:crypto'
import { type Server, createServer } from 'node:http'
import type { ControlStore } from './control-store.js'
import { HttpError } from './m8-auth.js'
import type { CommunityProvisioner } from './provisioning.js'
import type { RouteContext } from './routes/context.js'
import { readBody, writeJson } from './routes/http.js'

export type OpsConfig = {
  host: string
  port: number
  secret: string
  origin: string
  operators: Record<string, 'viewer' | 'operator'>
  probes: Record<string, string>
}

export function loadOpsConfig(): OpsConfig | undefined {
  if (!process.env.CHAT_OPS_PORT) return undefined
  const port = Number(process.env.CHAT_OPS_PORT)
  const secret = process.env.CHAT_OPS_PROXY_SECRET ?? ''
  const origin = new URL(process.env.CHAT_OPS_ORIGIN ?? '').origin
  const operators = JSON.parse(process.env.CHAT_OPS_OPERATORS ?? '{}')
  const probes = JSON.parse(process.env.CHAT_OPS_PROBES ?? '{}')
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !/^[a-f0-9]{64}$/.test(secret) ||
    !Object.keys(operators).length ||
    Object.entries(operators).some(
      ([name, role]) =>
        !/^[A-Za-z0-9@._+-]{1,128}$/.test(name) ||
        !['viewer', 'operator'].includes(String(role)),
    )
  ) {
    throw Error('Invalid private chat operations configuration')
  }
  for (const [name, value] of Object.entries(probes)) {
    if (
      !['synapse', 'mas', 'idp', 'broker', 'relay', 'appview'].includes(name) ||
      typeof value !== 'string'
    )
      throw Error('Invalid chat health probe')
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error('Invalid chat health probe URL')
  }
  return {
    host: process.env.CHAT_OPS_HOST ?? '127.0.0.1',
    port,
    secret,
    origin,
    operators,
    probes,
  }
}

async function health(
  probes: Record<string, string>,
): Promise<Record<string, { ok: boolean; checkedAt: string }>> {
  const entries = await Promise.all(
    Object.entries(probes).map(async ([name, url]) => {
      let ok = false
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(2500),
          redirect: 'error',
        })
        ok = response.ok
        await response.body?.cancel()
      } catch {
        /* Only availability leaves this endpoint, never upstream bodies. */
      }
      return [name, { ok, checkedAt: new Date().toISOString() }]
    }),
  )
  return Object.fromEntries(entries)
}

export function createOpsServer(
  config: OpsConfig,
  ctx: Pick<RouteContext, 'db' | 'matrix' | 'log'> &
    Partial<Pick<RouteContext, 'firehose'>>,
  store: ControlStore,
  provisioner: CommunityProvisioner,
): Server {
  return createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-content-type-options', 'nosniff')
    try {
      const key = req.headers['x-para-ops-key']
      const operator = req.headers['x-para-operator']
      if (
        typeof key !== 'string' ||
        !/^[a-f0-9]{64}$/.test(key) ||
        key.length !== config.secret.length ||
        !timingSafeEqual(Buffer.from(key), Buffer.from(config.secret)) ||
        typeof operator !== 'string' ||
        !Object.hasOwn(config.operators, operator)
      )
        throw new HttpError(403, 'CHAT_OPERATOR_REQUIRED')
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new HttpError(403, 'CROSS_SITE_DENIED')
      const path = new URL(req.url ?? '/', config.origin).pathname
      if (req.method === 'GET' && path === '/chat-ops/v1/status') {
        const [
          jobs,
          devices,
          audit,
          communities,
          cursor,
          sourceId,
          services,
          failures,
        ] = await Promise.all([
          store.jobs(),
          store.query(
            `SELECT id,device_id AS "deviceId",friendly_name AS "friendlyName",created_at AS "createdAt",last_seen_at AS "lastSeenAt",revoked_at AS "revokedAt" FROM device_sessions ORDER BY created_at DESC,id LIMIT 100`,
          ),
          store.audit(),
          store.query(
            `SELECT community_uri AS "communityUri",slug,chamber_mode AS "chamberMode",space_id AS "spaceId" FROM community_space_map ORDER BY created_at DESC LIMIT 100`,
          ),
          ctx.db.getSyncCursor(),
          ctx.db.getSyncSource(),
          health(config.probes),
          ctx.db.getFailedSyncs(100),
        ])
        writeJson(res, 200, {
          operator,
          role: config.operators[operator],
          services: {
            bridge: { ok: true, checkedAt: new Date().toISOString() },
            ...services,
          },
          ingestion: ctx.firehose?.ingestionStatus() ?? null,
          checkpoint: {
            sourceId: sourceId ?? null,
            cursor: cursor === undefined ? null : String(cursor),
          },
          jobs: jobs.map((job) => ({
            id: job.id,
            communityUri: JSON.parse(job.input).communityUri,
            state: job.state,
            attempts: job.attempts,
            updated: job.updated,
          })),
          devices,
          communities,
          audit,
          failures: failures.map((f) => ({
            id: f.id,
            eventType: f.eventType,
            communityUri: f.communityUri,
            retryCount: f.retryCount,
            createdAt: f.createdAt,
          })),
          limit: 100,
        })
        return
      }
      const match =
        /^\/chat-ops\/v1\/(jobs|devices)\/([a-zA-Z0-9-]{1,128})\/(retry|revoke)$/.exec(
          path,
        )
      if (
        req.method !== 'POST' ||
        !match ||
        (match[1] === 'jobs') !== (match[3] === 'retry')
      )
        throw new HttpError(404, 'NOT_FOUND')
      if (config.operators[operator] !== 'operator')
        throw new HttpError(403, 'CHAT_WRITE_PERMISSION_REQUIRED')
      if (
        req.headers.origin !== config.origin ||
        req.headers['x-para-chat-action'] !== '1' ||
        req.headers['content-type'] !== 'application/json'
      )
        throw new HttpError(403, 'ACTION_ORIGIN_REQUIRED')
      let body: any
      try {
        body = JSON.parse(await readBody(req, 4096))
      } catch (error) {
        if (error instanceof HttpError) throw error
        throw new HttpError(400, 'INVALID_JSON')
      }
      if (
        !body ||
        Object.keys(body).some((k) => !['requestId', 'reason'].includes(k)) ||
        typeof body.requestId !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(body.requestId) ||
        typeof body.reason !== 'string' ||
        body.reason.trim().length < 5 ||
        body.reason.length > 256 ||
        Array.from(body.reason as string).some(
          (character) => character.charCodeAt(0) < 32,
        )
      )
        throw new HttpError(400, 'REQUEST_ID_AND_REASON_REQUIRED')
      const entry = {
        requestId: body.requestId,
        operator,
        action: match[3],
        target: match[2],
        reason: body.reason.trim(),
      }
      const isNew = await store.beginAudit(entry)
      if (!isNew) {
        const old = (
          await store.query(
            `SELECT operator,action,target,reason,result FROM chat_ops_audit WHERE request_id=$1`,
            [entry.requestId],
          )
        )[0]
        if (
          !old ||
          ['operator', 'action', 'target', 'reason'].some(
            (k) => old[k] !== entry[k as keyof typeof entry],
          )
        )
          throw new HttpError(409, 'REQUEST_ID_CONFLICT')
        writeJson(res, old.result === 'success' ? 200 : 409, {
          requestId: entry.requestId,
          result: old.result,
          replay: true,
        })
        return
      }
      try {
        if (entry.action === 'retry') {
          if (!(await provisioner.retry(entry.target, true))) {
            const [job] = await store.query(
              'SELECT state FROM chat_provision_jobs WHERE id=$1',
              [entry.target],
            )
            // An automatic worker may have completed it after the page loaded.
            if (job?.state !== 'done')
              throw new HttpError(409, 'JOB_NOT_ELIGIBLE')
          }
        } else {
          const device = await ctx.db.getDeviceSession(entry.target)
          if (!device) throw new HttpError(404, 'DEVICE_NOT_FOUND')
          await ctx.matrix.adminDeactivateDevice(device.mxid, device.deviceId)
          await ctx.db.revokeDeviceSession(device.did, device.id)
        }
        await store.finishAudit(entry.requestId, 'success')
        writeJson(res, 200, { requestId: entry.requestId, result: 'success' })
      } catch (error) {
        await store.finishAudit(
          entry.requestId,
          error instanceof HttpError ? error.message : 'failed',
        )
        throw error
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.statusCode : 502
      if (status === 502)
        ctx.log.error({ err: error }, 'Private chat operation failed')
      if (!res.headersSent)
        writeJson(res, status, {
          error:
            error instanceof HttpError
              ? error.message
              : 'CHAT_OPERATION_FAILED',
        })
    }
  })
}
