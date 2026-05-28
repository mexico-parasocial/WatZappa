import { getDb } from '../pds/src/account-manager/db/index.js'

async function run() {
  const db = getDb(
    process.env.DB_POSTGRES_URL || 'postgresql://bsky:bsky@localhost:5432/bsky',
    false,
  )
  const account = await db.db
    .selectFrom('account')
    .selectAll()
    .where('handle', '=', 'alice.test')
    .executeTakeFirst()
  console.log('ACCOUNT:', account)
  if (account) {
    const tokens = await db.db
      .selectFrom('refresh_token')
      .selectAll()
      .where('did', '=', account.did)
      .execute()
    console.log('TOKENS:', tokens)
  }
}
run().catch(console.error)
