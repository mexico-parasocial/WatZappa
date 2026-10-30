import pino from 'pino'
import { createBridge } from './bridge.js'
import { loadConfig } from './config.js'

async function main() {
  const config = loadConfig()

  const log = pino({
    level: config.logLevel,
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  })

  log.info('Matrix↔PARA Community Bridge starting...')

  const bridge = await createBridge(config, log)

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...')
    await bridge.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await bridge.start()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
