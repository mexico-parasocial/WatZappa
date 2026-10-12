import { Router } from 'express'
import type { HandleString } from '@atproto/syntax'
import type { AppContext } from './context.js'

export const createRouter = (ctx: AppContext): Router => {
  const router = Router()

  router.get('/.well-known/atproto-did', async function (req, res) {
    const handle = req.hostname as HandleString
    const supportedHandle =
      !ctx.cfg.entryway &&
      ctx.cfg.identity.serviceHandleDomains.some(
        (host) => handle.endsWith(host) || handle === host.slice(1),
      )
    if (!supportedHandle) {
      return res.status(404).send('User not found')
    }
    let did: string | undefined
    try {
      const user = await ctx.accountManager.getAccount(handle)
      did = user?.did
    } catch (err) {
      return res.status(500).send('Internal Server Error')
    }
    if (!did) {
      return res.status(404).send('User not found')
    }
    res.type('text/plain').send(did)
  })

  // Asked by the TLS proxy before it issues an on-demand certificate for a
  // handle domain (Caddy `on_demand_tls { ask }`). 200 only for this PDS's own
  // hostname and for handles of accounts that exist here, so nobody can make
  // the proxy request certificates for arbitrary names under the wildcard.
  router.get('/tls-check', async function (req, res) {
    const domain =
      typeof req.query.domain === 'string' ? req.query.domain.toLowerCase() : ''
    if (!domain) {
      return res.status(400).send('Missing domain')
    }
    if (domain === ctx.cfg.service.hostname) {
      return res.status(200).send('OK')
    }
    const supportedHandle =
      !ctx.cfg.entryway &&
      ctx.cfg.identity.serviceHandleDomains.some((host) =>
        domain.endsWith(host),
      )
    if (!supportedHandle) {
      return res.status(400).send('Not a handle domain of this PDS')
    }
    try {
      const user = await ctx.accountManager.getAccount(domain as HandleString)
      if (!user) {
        return res.status(404).send('User not found')
      }
    } catch (err) {
      return res.status(500).send('Internal Server Error')
    }
    res.status(200).send('OK')
  })

  return router
}
