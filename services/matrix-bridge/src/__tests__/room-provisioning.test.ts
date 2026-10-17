import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { MatrixAdminClient } from '../matrix.js'

const community = 'at://did:plc:owner/com.para.community.board/one'
let server: ReturnType<typeof createServer>
let matrix: MatrixAdminClient
let marker: string
let creator: string
let payload: any
beforeEach(async () => {
  marker = community
  creator = '@bridge:matrix.test'
  server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url?.endsWith('/createRoom')) {
      let body = ''
      for await (const chunk of req) body += chunk
      payload = JSON.parse(body)
      res.statusCode = 400
      res.end(
        JSON.stringify({ errcode: 'M_ROOM_IN_USE', error: 'alias exists' }),
      )
    } else if (req.url?.includes('/directory/room/'))
      res.end(JSON.stringify({ room_id: '!existing:matrix.test' }))
    else if (req.url?.endsWith('/account/whoami'))
      res.end(JSON.stringify({ user_id: '@bridge:matrix.test' }))
    else if (req.url?.endsWith('/state'))
      res.end(
        JSON.stringify([
          {
            type: 'm.room.create',
            state_key: '',
            sender: creator,
            content: {},
          },
          {
            type: 'com.para.community',
            state_key: '',
            content: { uri: marker },
          },
          {
            type: 'm.space.parent',
            state_key: '!space:matrix.test',
            content: { via: ['matrix.test'] },
          },
          {
            type: 'm.room.encryption',
            state_key: '',
            content: { algorithm: 'm.megolm.v1.aes-sha2' },
          },
        ]),
      )
    else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  matrix = new MatrixAdminClient({
    matrixHomeserverUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    matrixAdminToken: 'fixture-only',
    matrixServerName: 'matrix.test',
    matrixEnableEncryption: true,
  } as Config)
})
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
describe('partial room creation recovery', () => {
  it('reuses a matching encrypted child and lets ordinary members send messages', async () => {
    expect(
      await matrix.createRoom('A', 'one-a', '!space:matrix.test', community),
    ).toBe('!existing:matrix.test')
    expect(payload.power_level_content_override.events_default).toBe(0)
    expect(payload.power_level_content_override.state_default).toBe(50)
    expect(payload.initial_state).toContainEqual({
      type: 'm.space.parent',
      state_key: '!space:matrix.test',
      content: { via: ['matrix.test'] },
    })
  })
  it('rejects an alias bound to another community', async () => {
    marker = 'at://did:plc:other/com.para.community.board/one'
    await expect(
      matrix.createRoom('A', 'one-a', '!space:matrix.test', community),
    ).rejects.toThrow('matching bridge-managed')
  })
  it('rejects a room created by another account', async () => {
    creator = '@other:matrix.test'
    await expect(
      matrix.createRoom('A', 'one-a', '!space:matrix.test', community),
    ).rejects.toThrow('matching bridge-managed')
  })
})
