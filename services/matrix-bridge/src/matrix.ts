import type { Config } from './config.js'

export interface MatrixRoomMember {
  user_id: string
  display_name?: string
  avatar_url?: string
}

export class MatrixAdminClient {
  private baseUrl: string
  private adminToken: string

  constructor(config: Config) {
    this.baseUrl = config.matrixHomeserverUrl.replace(/\/$/, '')
    this.adminToken = config.matrixAdminToken
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Matrix API error ${res.status}: ${text}`)
    }

    const contentType = res.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return res.json()
    }
    return res.text()
  }

  private encryptedInitialState(): Array<{
    type: string
    state_key?: string
    content: Record<string, unknown>
  }> {
    return [
      {
        type: 'm.room.encryption',
        content: { algorithm: 'm.megolm.v1.aes-sha2' },
      },
    ]
  }

  async createSpace(name: string, slug: string): Promise<string> {
    const res = await this.request('/_synapse/admin/v1/rooms', {
      method: 'POST',
      body: JSON.stringify({
        room_alias_name: slug,
        name,
        preset: 'private_chat',
        creation_content: {
          type: 'm.space',
        },
        initial_state: this.encryptedInitialState(),
        power_level_content_override: {
          users_default: 0,
          events_default: 50,
          state_default: 50,
          ban: 50,
          kick: 50,
          redact: 50,
          invite: 50,
        },
      }),
    })
    return res.room_id as string
  }

  async createRoom(
    name: string,
    alias: string,
    parentSpaceId?: string,
  ): Promise<string> {
    const body: any = {
      room_alias_name: alias,
      name,
      preset: 'private_chat',
      power_level_content_override: {
        users_default: 0,
        events_default: 50,
        state_default: 50,
        ban: 50,
        kick: 50,
        redact: 50,
        invite: 50,
      },
    }
    if (parentSpaceId) {
      body.initial_state = [
        ...this.encryptedInitialState(),
        {
          type: 'm.space.parent',
          state_key: parentSpaceId,
          content: { via: [extractServerName(this.baseUrl)] },
        },
      ]
    } else {
      body.initial_state = this.encryptedInitialState()
    }
    const res = await this.request('/_synapse/admin/v1/rooms', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return res.room_id as string
  }

  async addChildSpace(
    parentId: string,
    childId: string,
    via: string[],
  ): Promise<void> {
    await this.request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(parentId)}/state/m.space.child/${encodeURIComponent(childId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ via, suggested: false }),
      },
    )
  }

  async inviteUser(roomId: string, userId: string): Promise<void> {
    await this.request(
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      },
    )
  }

  async kickUser(
    roomId: string,
    userId: string,
    reason = 'Left PARA community',
  ): Promise<void> {
    await this.request(
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/kick`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, reason }),
      },
    )
  }

  async setPowerLevel(
    roomId: string,
    userId: string,
    level: number,
  ): Promise<void> {
    await this.request(
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/power_levels`,
      {
        method: 'PUT',
        body: JSON.stringify({ users: { [userId]: level } }),
      },
    )
  }

  async getRoomMembers(roomId: string): Promise<MatrixRoomMember[]> {
    const res = await this.request(
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/members`,
    )
    return (res.members ?? []) as MatrixRoomMember[]
  }

  async userExists(userId: string): Promise<boolean> {
    try {
      await this.request(
        `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      )
      return true
    } catch {
      return false
    }
  }

  async createUser(
    userId: string,
    displayName: string,
    password: string,
  ): Promise<void> {
    await this.request(
      `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          displayname: displayName,
          password,
          admin: false,
        }),
      },
    )
  }

  async generateUserToken(
    userId: string,
  ): Promise<{ accessToken: string; deviceId: string }> {
    const res = await this.request(
      `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/login`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    )
    return {
      accessToken: res.access_token as string,
      deviceId: res.device_id as string,
    }
  }

  async setPusherWithUserToken(
    mxid: string,
    userToken: string,
    pushkey: string,
    appId: string,
    gatewayUrl: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/_matrix/client/v3/pushers/set`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'http',
        app_id: appId,
        app_display_name: 'PARA',
        device_display_name: 'PARA Device',
        pushkey,
        lang: 'es',
        data: { url: gatewayUrl },
        append: false,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Matrix setPusher error ${res.status}: ${text}`)
    }
  }

  /**
   * Fetch recent messages from a room using Synapse Admin API.
   * Returns {chunk: MatrixEvent[], start: string, end: string}
   */
  async getRoomMessages(
    roomId: string,
    opts: { from?: string; to?: string; limit?: number; dir?: 'f' | 'b' } = {},
  ): Promise<{
    chunk: Array<{
      event_id: string
      sender: string
      type: string
      content: Record<string, unknown>
      origin_server_ts: number
    }>
    start: string
    end?: string
  }> {
    const params = new URLSearchParams()
    params.set('limit', String(opts.limit ?? 100))
    params.set('dir', opts.dir ?? 'b')
    if (opts.from) params.set('from', opts.from)
    if (opts.to) params.set('to', opts.to)

    const res = await this.request(
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`,
    )
    return res as any
  }
}

export function didToMxid(did: string, serverName: string): string {
  // did:plc:abc123 -> @did-plc-abc123:matrix.para.social
  const localpart = did.replace(/:/g, '-').replace(/\./g, '-')
  return `@${localpart}:${serverName}`
}

export function extractServerName(homeserverUrl: string): string {
  try {
    const url = new URL(homeserverUrl)
    return url.hostname
  } catch {
    return 'matrix.para.social'
  }
}
