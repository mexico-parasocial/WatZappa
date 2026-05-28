// NOTE: this file should be imported first, particularly before `@atproto/common` (for logging), to ensure that environment variables are respected in library code
import fs from 'node:fs'
import dotenv from 'dotenv'

const env = process.env.ENV
if (env) {
  const envFileCandidates = [`./.${env}.env`, `./.env.${env}`]
  const envFile = envFileCandidates.find((path) => fs.existsSync(path))
  dotenv.config(envFile ? { path: envFile } : undefined)
} else {
  dotenv.config()
}
