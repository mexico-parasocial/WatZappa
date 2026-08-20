import pino from 'pino'
import { loadConfig } from './config.js'
import { Signer } from './oidc.js'
import { LoginStore } from './store.js'
import { createIdpServer } from './server.js'

const config = loadConfig()
const log = pino({ level: config.logLevel })

const signer = await Signer.load(config.privateKeyPem)
if (!config.privateKeyPem) {
  log.warn(
    'PARA_IDP_PRIVATE_KEY is not set — using an ephemeral signing key. ' +
      'Every restart invalidates outstanding tokens and rotates the JWKS. ' +
      'Do not run production this way.',
  )
}

const server = createIdpServer({ config, signer, store: new LoginStore() })

server.listen(config.port, () => {
  log.info(
    { issuer: config.issuer, port: config.port, kid: signer.kid },
    'para-idp listening',
  )
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info('shutting down')
    server.close(() => process.exit(0))
  })
}
