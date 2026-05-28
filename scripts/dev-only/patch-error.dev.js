/* eslint-env node */
if (process.env.NODE_ENV === 'production') {
  console.log('Skipping patch-error in production')
  process.exit(0)
}

const fs = require('node:fs')
const filepath = 'node_modules/@atproto/xrpc-server/dist/server.js'
if (fs.existsSync(filepath)) {
  let content = fs.readFileSync(filepath, 'utf8')
  content = content.replace(
    "httpLogger.error({ err: err2 }, 'xrpc server error')",
    "httpLogger.error({ err: err2 }, 'xrpc server error'); require('node:fs').appendFileSync('/tmp/pds-error.log', '====== XRPC ERROR ======\\n' + String(err2) + '\\n' + String(err2?.stack) + '\\n');",
  )
  // Also handle another format just in case
  content = content.replace(
    "httpLogger.error({ err }, 'xrpc server error')",
    "httpLogger.error({ err }, 'xrpc server error'); require('node:fs').appendFileSync('/tmp/pds-error.log', '====== XRPC ERROR ======\\n' + String(err) + '\\n' + String(err?.stack) + '\\n');",
  )
  fs.writeFileSync(filepath, content)
  console.log('Patched!')
} else {
  console.log('Not found in node_modules, patching packages directly:')
  const pkgPath = 'packages/xrpc-server/dist/server.js'
  if (fs.existsSync(pkgPath)) {
    let content = fs.readFileSync(pkgPath, 'utf8')
    content = content.replace(
      "httpLogger.error({ err }, 'xrpc server error');",
      "httpLogger.error({ err }, 'xrpc server error'); require('node:fs').appendFileSync('/tmp/pds-error.log', '====== XRPC ERROR ======\\n' + String(err) + '\\n' + String(err?.stack) + '\\n');",
    )
    content = content.replace(
      "httpLogger.error({ err: err2 }, 'xrpc server error');",
      "httpLogger.error({ err: err2 }, 'xrpc server error'); require('node:fs').appendFileSync('/tmp/pds-error.log', '====== XRPC ERROR ======\\n' + String(err2) + '\\n' + String(err2?.stack) + '\\n');",
    )
    fs.writeFileSync(pkgPath, content)
    console.log('Patched packages!')
  }
}
