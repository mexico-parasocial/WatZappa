/** MAS 1.24 Admin API. Session authority stays in MAS, never in a browser. */
export type MasAdminSettings = {
  adminUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  serverName: string
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const MAX_JSON = 128 * 1024

class MasHttpError extends Error {
  constructor(readonly status: number) {
    super(`MAS admin request failed: HTTP ${status}`)
  }
}

async function boundedJson(response: Response): Promise<any> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing MAS response')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_JSON) throw new Error('MAS response exceeds limit')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export class MasAdminClient {
  private token?: { value: string; expiresAt: number }
  private tokenPromise?: Promise<string>
  private adminUrl: string

  constructor(private settings: MasAdminSettings) {
    const admin = new URL(settings.adminUrl)
    const token = new URL(settings.tokenUrl)
    for (const url of [admin, token]) {
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('Invalid MAS administration endpoint')
      }
    }
    if (admin.pathname !== '/')
      throw new Error('MAS admin URL must be an origin')
    this.adminUrl = admin.origin
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value
    if (!this.tokenPromise)
      this.tokenPromise = (async () => {
        const basic = Buffer.from(
          `${encodeURIComponent(this.settings.clientId)}:${encodeURIComponent(this.settings.clientSecret)}`,
        ).toString('base64')
        const response = await fetch(this.settings.tokenUrl, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            authorization: `Basic ${basic}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'urn:mas:admin',
          }),
        })
        if (!response.ok) {
          await response.body?.cancel()
          throw new MasHttpError(response.status)
        }
        const data = await boundedJson(response)
        if (
          typeof data.access_token !== 'string' ||
          !/^[A-Za-z0-9._~-]{16,4096}$/.test(data.access_token) ||
          !Number.isFinite(data.expires_in) ||
          data.expires_in <= 0 ||
          data.expires_in > 86400
        ) {
          throw new Error('Invalid MAS service token response')
        }
        this.token = {
          value: data.access_token,
          expiresAt: Date.now() + Math.max(0, data.expires_in - 30) * 1000,
        }
        return data.access_token
      })()
    try {
      return await this.tokenPromise
    } finally {
      this.tokenPromise = undefined
    }
  }

  private async api(
    path: string,
    signal: AbortSignal,
    method = 'GET',
    retry = true,
  ): Promise<any> {
    const token = await this.accessToken()
    const response = await fetch(`${this.adminUrl}/api/admin/v1/${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      headers: { authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401 && retry) {
        this.token = undefined
        return this.api(path, signal, method, false)
      }
      throw new MasHttpError(response.status)
    }
    return boundedJson(response)
  }

  async revokeDevice(mxid: string, deviceId: string): Promise<void> {
    const match = /^@([a-z2-7]{32}):(.+)$/.exec(mxid)
    if (
      !match ||
      match[2] !== this.settings.serverName ||
      !/^[A-Za-z0-9_.=-]{1,128}$/.test(deviceId)
    ) {
      throw new Error('Invalid MAS device revocation target')
    }
    const signal = AbortSignal.timeout(30000)
    const user = (
      await this.api(
        `users/by-username/${encodeURIComponent(match[1])}`,
        signal,
      )
    ).data
    if (!ULID.test(user?.id) || user.attributes?.username !== match[1])
      throw new Error('MAS user identity mismatch')
    const targets: Array<{ kind: string; id: string }> = []
    for (const kind of ['oauth2-sessions', 'compat-sessions']) {
      let after: string | undefined
      for (let page = 0; ; page++) {
        if (page >= 100) throw new Error('MAS session pagination exceeds limit')
        const query = new URLSearchParams({
          'filter[user]': user.id,
          'filter[status]': 'active',
          'page[first]': '50',
          count: 'false',
        })
        if (after) query.set('page[after]', after)
        const document = await this.api(`${kind}?${query}`, signal)
        if (!Array.isArray(document.data) || document.data.length > 50)
          throw new Error('Invalid MAS session page')
        for (const item of document.data) {
          if (!ULID.test(item.id) || item.attributes?.user_id !== user.id)
            throw new Error('MAS session owner mismatch')
          const attributes = item.attributes
          const deviceMatches =
            kind === 'compat-sessions'
              ? attributes.device_id === deviceId
              : typeof attributes.scope === 'string' &&
                attributes.scope
                  .split(' ')
                  .some(
                    (scope: string) =>
                      scope ===
                        `urn:matrix:org.matrix.msc2967.client:device:${deviceId}` ||
                      scope === `urn:matrix:client:device:${deviceId}`,
                  )
          if (deviceMatches && !attributes.finished_at)
            targets.push({ kind, id: item.id })
        }
        if (!document.links?.next) break
        const last = document.data.at(-1)?.id
        if (!last || last === after)
          throw new Error('MAS pagination did not advance')
        // Never follow a response URL with administrative credentials.
        after = last
      }
    }
    for (const { kind, id } of targets) {
      try {
        await this.api(`${kind}/${id}/finish`, signal, 'POST')
      } catch (error) {
        if (
          !(error instanceof MasHttpError) ||
          ![400, 404].includes(error.status)
        )
          throw error
        try {
          const current = await this.api(`${kind}/${id}`, signal)
          if (!current.data?.attributes?.finished_at) throw error
        } catch (check) {
          if (!(check instanceof MasHttpError && check.status === 404))
            throw check
        }
      }
    }
  }
}
