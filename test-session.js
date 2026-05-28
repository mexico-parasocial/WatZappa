const { TestNetwork } = require('./packages/dev-env/dist/network');
const { TestPds } = require('./packages/dev-env/dist/pds');
const { createClient } = require('@atproto/api');

async function run() {
  try {
    const res = await fetch("http://localhost:2583/xrpc/com.atproto.server.createSession", {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice.test', password: 'hunter2' })
    });
    console.log(res.status, await res.text());
  } catch (err) {
    console.error(err);
  }
}
run();
