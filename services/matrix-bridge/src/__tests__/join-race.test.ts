import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { MatrixAdminClient } from '../matrix.js'

const room = '!room:matrix.test'
const member = '@member:matrix.test'
let server: ReturnType<typeof createServer>
let matrix: MatrixAdminClient
let joined: boolean
let adminJoins: number
let markJoined: () => void
let joinedNow: Promise<void>
// How the homeserver answers the n-th admin join (1-based).
let answerJoin: (n: number) => Promise<{ status: number; body: object }>

beforeEach(async () => {
  joined = false
  adminJoins = 0
  joinedNow = new Promise((resolve) => {
    markJoined = () => {
      joined = true
      resolve()
    }
  })
  answerJoin = async () => {
    markJoined()
    return { status: 200, body: { room_id: room } }
  }
  server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    const url = decodeURIComponent(req.url ?? '')
    if (req.method === 'POST' && url.startsWith('/_synapse/admin/v1/join/')) {
      const { status, body } = await answerJoin(++adminJoins)
      res.statusCode = status
      res.end(JSON.stringify(body))
    } else if (url.endsWith(`/state/m.room.member/${member}`) && joined) {
      res.end(JSON.stringify({ membership: 'join' }))
    } else {
      res.statusCode = 404
      res.end(JSON.stringify({ errcode: 'M_NOT_FOUND', error: 'Not found' }))
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

describe('joinUser', () => {
  it('accepts a join that a concurrent verified request completed first', async () => {
    answerJoin = async (n) => {
      if (n === 1) {
        // The first request wins after the second has already started.
        while (adminJoins < 2) await new Promise((r) => setTimeout(r, 5))
        markJoined()
        return { status: 200, body: { room_id: room } }
      }
      // Synapse's invitation step refuses a member who is now in the room.
      await joinedNow
      return {
        status: 403,
        body: {
          errcode: 'M_FORBIDDEN',
          error: `${member} is already in the room.`,
        },
      }
    }
    await expect(
      Promise.all([
        matrix.joinUser(room, member),
        matrix.joinUser(room, member),
      ]),
    ).resolves.toEqual([room, room])
    expect(adminJoins).toBe(2)
  })

  it('does not force-join a member who is already in the room', async () => {
    markJoined()
    expect(await matrix.joinUser(room, member)).toBe(room)
    expect(adminJoins).toBe(0)
  })

  it('still fails when the join failed and the member is not in the room', async () => {
    answerJoin = async () => ({
      status: 403,
      body: { errcode: 'M_FORBIDDEN', error: 'Not allowed' },
    })
    await expect(matrix.joinUser(room, member)).rejects.toThrow(
      'Matrix API error 403',
    )
  })
})
