// @ts-nocheck
import { introspectionPayload } from '../src/introspect.js'

// WatZappa scripts/sync-local-dev-service.sh reads `bsky.did` and `chat.did`
// from this payload to configure PARA's atproto-proxy targets.
describe('introspectionPayload', () => {
  const services = {
    plc: { url: 'http://localhost:2582' },
    pds: {
      url: 'http://localhost:2583',
      ctx: { cfg: { service: { did: 'did:web:localhost' } } },
    },
    bsky: {
      url: 'http://localhost:2584',
      ctx: { cfg: { serverDid: 'did:plc:appview' } },
    },
    ozone: {
      url: 'http://localhost:2587',
      ctx: {
        cfg: {
          service: { did: 'did:plc:ozone' },
          db: { postgresUrl: 'postgresql://localhost/db' },
        },
      },
    },
  }

  it('reports the AppView and chat service DIDs', () => {
    const payload = introspectionPayload({
      ...services,
      chat: { url: 'http://localhost:2590', did: 'did:plc:chat' },
    })
    expect(payload.bsky).toEqual({
      url: 'http://localhost:2584',
      did: 'did:plc:appview',
    })
    expect(payload.chat).toEqual({
      url: 'http://localhost:2590',
      did: 'did:plc:chat',
    })
  })

  it('omits chat when the network has none', () => {
    expect(introspectionPayload(services)).not.toHaveProperty('chat')
  })
})
