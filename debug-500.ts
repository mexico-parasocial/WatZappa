import { Database } from './packages/pds/src/db/index.js';
import { PDS } from './packages/pds/src/app';
import { envToCfg, envToSecrets } from './packages/pds/src/config/index.js';
import { Secp256k1Keypair } from '@atproto/crypto';

async function main() {
  const env = {
    port: 2584,
    dbPostgresUrl: 'postgresql://bsky:bsky@localhost:5432/bsky',
    jwtSecret: 'jwt-secret',
    adminPassword: 'admin-pass',
    devMode: true,
    blobstoreDiskLocation: '/tmp/test-pds-blobstore',
  };
  // To avoid breaking constraints, we don't start the sequencer
  // Just initialize AppContext manually, or PDS!
  const cfg = envToCfg(env as any);
  cfg.db.accountDbLoc = env.dbPostgresUrl;
  const secrets = envToSecrets(env as any);
  const pds = await PDS.create(cfg, secrets);
  await pds.start();
  
  try {
    const res = await fetch("http://localhost:2584/xrpc/com.atproto.server.createSession", {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice.test', password: 'hunter2' })
    });
    console.log(res.status, await res.text());
  } catch (err) {
    console.error(err);
  }
  
  await pds.destroy();
}
main().catch(console.error);
