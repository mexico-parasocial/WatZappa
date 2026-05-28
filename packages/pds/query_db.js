/* eslint-env node */
const { Client } = require('pg')
async function query() {
  const client = new Client({
    connectionString: 'postgresql://bsky:bsky@localhost:5432/bsky',
  })
  await client.connect()
  const res = await client.query(
    "SELECT * FROM account WHERE handle = 'alice.test'",
  )
  console.log('Account:', res.rows[0])
  await client.end()
}
query().catch((err) => {
  console.error('Error:', err.message)
})
