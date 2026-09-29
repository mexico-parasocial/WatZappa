import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Secp256k1Keypair } from '@atproto/crypto'

type PlcOp = { operation?: { verificationMethods?: { atproto?: string } } }

async function checkIdentity(root: string): Promise<void> {
  const accountDb = path.join(root, 'pds', 'account.sqlite')
  const plcFile = path.join(root, 'plc', 'plc.json')
  try {
    await fs.access(accountDb)
  } catch {
    console.log('Identity check: new PDS, no accounts yet')
    return
  }

  const plc = JSON.parse(await fs.readFile(plcFile, 'utf8')) as Record<
    string,
    PlcOp[]
  >
  const rows = execFileSync(
    'sqlite3',
    ['-readonly', accountDb, 'SELECT did FROM actor ORDER BY did'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
  const actorDir = path.join(root, 'pds', 'actors')
  const shards = await fs.readdir(actorDir)

  for (const did of rows) {
    const documentedKey =
      plc[did]?.at(-1)?.operation?.verificationMethods?.atproto
    if (!documentedKey) {
      throw new Error(`PDS account ${did} has no atproto key in the local PLC`)
    }
    let keyPath: string | undefined
    for (const shard of shards) {
      const candidate = path.join(actorDir, shard, did, 'key')
      try {
        await fs.access(candidate)
        keyPath = candidate
        break
      } catch {
        continue
      }
    }
    if (!keyPath) throw new Error(`PDS account ${did} has no signing key`)
    const keypair = await Secp256k1Keypair.import(await fs.readFile(keyPath))
    if (keypair.did() !== documentedKey) {
      throw new Error(`PDS signing key disagrees with PLC for ${did}`)
    }
  }
  console.log(`Identity check: ${rows.length} accounts match the local PLC`)
}

await checkIdentity(process.argv[2])
