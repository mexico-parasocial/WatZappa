import assert from 'node:assert'
import { Redis } from 'ioredis'
import { redisLogger } from './logger.js'

export const getRedisClient = (host: string, password?: string): Redis => {
  const redisAddr = redisAddressParts(host)
  const redis = new Redis({
    ...redisAddr,
    password,
    // MVP hardening: avoid crashing the PDS on transient Redis failures.
    maxRetriesPerRequest: 3,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 3_000)
      redisLogger.warn({ host, attempt: times, delay }, 'redis retrying')
      return delay
    },
  })
  redis.on('error', (err) => {
    redisLogger.error({ host, err }, 'redis error')
  })
  redis.on('reconnecting', () => {
    redisLogger.warn({ host }, 'redis reconnecting')
  })
  return redis
}

export const redisAddressParts = (
  addr: string,
  defaultPort = 6379,
): { host: string; port: number } => {
  const [host, portStr, ...others] = addr.split(':')
  const port = portStr ? parseInt(portStr, 10) : defaultPort
  assert(host && !isNaN(port) && !others.length, `invalid address: ${addr}`)
  return { host, port }
}
