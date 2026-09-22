import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { verifyCabildeoProof } from './para-cabildeo-proof.js'

const did = 'did:plc:example'
const record = {
  subjectType: 'cabildeo',
  subject: 'at://did:plc:board/com.para.civic.cabildeo/one',
  cabildeo: 'at://did:plc:board/com.para.civic.cabildeo/one',
  selectedOption: 1,
  isDirect: true,
  voteNullifier: 'a'.repeat(64),
  eligibilityProofRef: 'm8:cabildeo:v1:' + 'b'.repeat(43),
}
let server: Server
let url: string
let responseStatus: number | 'disconnect' | 'timeout'
let received: unknown
let authorization: string | undefined
let requests = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    requests++
    authorization = req.headers.authorization
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      received = JSON.parse(body)
      if (responseStatus === 'disconnect') req.socket.destroy()
      else if (responseStatus !== 'timeout') res.writeHead(responseStatus).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/verify`
})
beforeEach(() => {
  responseStatus = 204
  received = undefined
  requests = 0
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

describe('public cabildeo proof verification', () => {
  it('sends the authenticated author, subject and option without session credentials', async () => {
    await expect(verifyCabildeoProof(did, record, url)).resolves.toBe(true)
    expect(received).toEqual({
      actorDid: did,
      subjectUri: record.subject,
      selectedOption: 1,
      voteNullifier: record.voteNullifier,
      eligibilityProofRef: record.eligibilityProofRef,
    })
    expect(authorization).toBeUndefined()
  })
  it.each([
    { voteNullifier: undefined },
    { eligibilityProofRef: 'invented' },
    { subject: 'at://different' },
    { isDirect: false },
    { selectedOption: -1 },
    { selectedOption: 1.5 },
  ])(
    'rejects malformed or ambiguous records before networking: %j',
    async (change) => {
      await expect(
        verifyCabildeoProof(did, { ...record, ...change }, url),
      ).resolves.toBe(false)
      expect(requests).toBe(0)
    },
  )
  it('rejects a claim rejected by the issuer', async () => {
    responseStatus = 422
    await expect(verifyCabildeoProof(did, record, url)).resolves.toBe(false)
  })
  it.each([200, 302, 401, 404, 500, 503])(
    'fails closed on unexpected HTTP status %s',
    async (status) => {
      responseStatus = status
      await expect(verifyCabildeoProof(did, record, url)).rejects.toThrow(
        /unavailable/,
      )
    },
  )
  it.each(['disconnect', 'timeout'] as const)(
    'fails closed on %s',
    async (mode) => {
      responseStatus = mode
      await expect(verifyCabildeoProof(did, record, url)).rejects.toThrow(
        /unavailable/,
      )
    },
  )
  it.each([
    '',
    'http://untrusted.example/verify',
    'https://user:secret@example.org/verify',
  ])('refuses missing or insecure configuration', async (configured) => {
    await expect(verifyCabildeoProof(did, record, configured)).rejects.toThrow()
    expect(requests).toBe(0)
  })
})
