import { Router } from 'express'
import { sql } from 'kysely'
import { AppContext } from './context.js'

export const createRouter = (ctx: AppContext): Router => {
  const router = Router()

  router.get('/', function (req, res) {
    res.type('text/plain')
    res.send(`
         __                         __
        /\\ \\__                     /\\ \\__
    __  \\ \\ ,_\\  _____   _ __   ___\\ \\ ,_\\   ___
  /'__'\\ \\ \\ \\/ /\\ '__'\\/\\''__\\/ __'\\ \\ \\/  / __'\\
 /\\ \\L\\.\\_\\ \\ \\_\\ \\ \\L\\ \\ \\ \\//\\ \\L\\ \\ \\ \\_/\\ \\L\\ \\
 \\ \\__/.\\_\\\\ \\__\\\\ \\ ,__/\\ \\_\\\\ \\____/\\ \\__\\ \\____/
  \\/__/\\/_/ \\/__/ \\ \\ \\/  \\/_/ \\/___/  \\/__/\\/___/
                   \\ \\_\\
                    \\/_/


This is an AT Protocol Personal Data Server (aka, an atproto PDS)

Most API routes are under /xrpc/

      Code: https://github.com/bluesky-social/atproto
 Self-Host: https://github.com/bluesky-social/pds
  Protocol: https://atproto.com
`)
  })

  router.get('/robots.txt', function (req, res) {
    res.type('text/plain')
    res.send(
      '# Hello!\n\n# Crawling the public API is allowed\nUser-agent: *\nAllow: /',
    )
  })

  router.get('/xrpc/_health', async function (req, res) {
    const { version } = ctx.cfg.service
    try {
      await sql`select 1`.execute(ctx.accountManager.db.db)
    } catch (err) {
      req.log.error({ err }, 'failed health check')
      res.status(503).send({ version, error: 'Service Unavailable' })
      return
    }
    res.send({ version })
  })

  // MVP: readiness probe — checks DB + Redis before marking pod ready.
  router.get('/xrpc/_ready', async function (req, res) {
    const { version } = ctx.cfg.service
    const checks: string[] = []

    try {
      await sql`select 1`.execute(ctx.accountManager.db.db)
      checks.push('db:ok')
    } catch (err) {
      req.log.error({ err }, 'readiness check failed: db')
      checks.push('db:fail')
    }

    if (ctx.cfg.redis) {
      try {
        await ctx.redisScratch?.ping()
        checks.push('redis:ok')
      } catch (err) {
        req.log.error({ err }, 'readiness check failed: redis')
        checks.push('redis:fail')
      }
    } else {
      checks.push('redis:skipped')
    }

    const allOk = checks.every(
      (c) => c.endsWith(':ok') || c.endsWith(':skipped'),
    )
    if (allOk) {
      res.send({ version, checks, ready: true })
    } else {
      res.status(503).send({ version, checks, ready: false })
    }
  })

  return router
}
