import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/config.js'
import { MatrixAdminClient } from '../src/matrix.js'

describe('Matrix room provision replay', () => {
  let server: Server
  let matrix: MatrixAdminClient
  let options: any
  let attempts: number
  let creator: string
  let membership: string
  let joinAttempts: number
  let raceJoin: boolean
  const uri = 'at://did:plc:test/com.para.community.board/one'

  beforeEach(async () => {
    attempts = 0
    creator = '@operator:matrix.test'
    membership = 'leave'
    joinAttempts = 0
    raceJoin = false
    server = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json')
      const path = decodeURIComponent(
        new URL(req.url!, 'http://fixture').pathname,
      )
      if (path.endsWith('/createRoom')) {
        attempts++
        if (attempts > 1) {
          res.writeHead(400)
          res.end(
            JSON.stringify({ errcode: 'M_ROOM_IN_USE', error: 'Alias exists' }),
          )
          return
        }
        let body = ''
        for await (const chunk of req) body += chunk
        options = JSON.parse(body)
        res.end(JSON.stringify({ room_id: '!room:matrix.test' }))
      } else if (path.includes('/state/m.room.member/')) {
        res.end(JSON.stringify({ membership }))
      } else if (path.startsWith('/_synapse/admin/v1/join/')) {
        joinAttempts++
        if (raceJoin) membership = 'join'
        res.writeHead(403)
        res.end(
          JSON.stringify({ errcode: 'M_FORBIDDEN', error: 'Cannot invite' }),
        )
      } else if (path.includes('/directory/room/')) {
        res.end(
          JSON.stringify({
            room_id: '!room:matrix.test',
            servers: ['matrix.test'],
          }),
        )
      } else if (path.endsWith('/state')) {
        res.end(
          JSON.stringify([
            {
              type: 'm.room.create',
              state_key: '',
              sender: creator,
              content: options.creation_content ?? {},
            },
            ...options.initial_state.map((event: any) => ({
              ...event,
              state_key: event.state_key ?? '',
            })),
          ]),
        )
      } else if (path.endsWith('/account/whoami')) {
        res.end(JSON.stringify({ user_id: '@operator:matrix.test' }))
      } else {
        res.writeHead(404)
        res.end('{}')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    matrix = new MatrixAdminClient({
      matrixHomeserverUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      matrixServerName: 'matrix.test',
      matrixAdminToken: 'fixture-operator-token',
      matrixEnableEncryption: true,
    } as Config)
  })
  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('reuses the original room after a lost database checkpoint', async () => {
    const room = await matrix.createSpace('Test', 'one', uri)
    expect(await matrix.createSpace('Test', 'one', uri)).toBe(room)
    expect(attempts).toBe(2)
  })

  it('refuses an alias belonging to another governance record', async () => {
    await matrix.createSpace('Test', 'one', uri)
    await expect(
      matrix.createSpace('Test', 'one', `${uri}-other`),
    ).rejects.toThrow('REQUIRES_REVIEW')
  })

  it('refuses an alias created by another Matrix account', async () => {
    await matrix.createSpace('Test', 'one', uri)
    creator = '@attacker:matrix.test'
    await expect(matrix.createSpace('Test', 'one', uri)).rejects.toThrow(
      'REQUIRES_REVIEW',
    )
  })

  it('refuses to adopt rooms lacking their governance or encryption state', async () => {
    await matrix.createSpace('Test', 'one', uri)
    options.initial_state = options.initial_state.filter(
      (event: any) => event.type !== 'm.room.encryption',
    )
    await expect(matrix.createSpace('Test', 'one', uri)).rejects.toThrow(
      'REQUIRES_REVIEW',
    )
  })

  it('records the real homeserver in child-room routing and preserves parent identity', async () => {
    const room = await matrix.createRoom(
      'Chamber',
      'one-a',
      '!parent:matrix.test',
      uri,
    )
    expect(options.initial_state).toContainEqual({
      type: 'm.space.parent',
      state_key: '!parent:matrix.test',
      content: { via: ['matrix.test'] },
    })
    expect(
      await matrix.createRoom('Chamber', 'one-a', '!parent:matrix.test', uri),
    ).toBe(room)
    await expect(
      matrix.createRoom('Chamber', 'one-a', '!other:matrix.test', uri),
    ).rejects.toThrow('REQUIRES_REVIEW')
  })

  it('does not invite a member who is already joined', async () => {
    membership = 'join'
    expect(
      await matrix.joinUser('!room:matrix.test', '@member:matrix.test'),
    ).toBe('!room:matrix.test')
    expect(joinAttempts).toBe(0)
  })

  it('recovers a concurrent join only after checking the resulting membership', async () => {
    raceJoin = true
    expect(
      await matrix.joinUser('!room:matrix.test', '@member:matrix.test'),
    ).toBe('!room:matrix.test')
    expect(joinAttempts).toBe(1)
  })

  it('does not turn a denied join into success', async () => {
    membership = 'ban'
    await expect(
      matrix.joinUser('!room:matrix.test', '@member:matrix.test'),
    ).rejects.toThrow('403')
  })
})
