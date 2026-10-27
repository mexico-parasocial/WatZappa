import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseCid } from '@atproto/lex-data'
import type { DidString, NsidString, RecordKeyString } from '@atproto/syntax'
import {
  LtHash,
  RepoCommit,
  formatSetHashElement,
  verifyCredentialSig,
  verifySpaceToken,
} from '../src/index.js'

type CommitCtx = { space: string; author: string; rev: string }

type Vectors = {
  now: number
  lthash: {
    ops: [string, string][]
    state: string
    digest: string
    empty: boolean
  }[]
  commits: {
    ctx: CommitCtx
    didKey: string
    records: {
      collection: NsidString
      rkey: RecordKeyString
      cid: string
      element: string
    }[]
    ikm: string
    ctxBytes: string
    hash: string
    mac: string
    sig: string
  }[]
  httpsig: {
    keyDid: DidString
    credentialKey: DidString | null
    headers: Record<string, string>
  }[]
  tokens: {
    type: 'delegation' | 'credential'
    jwt: string
    signingKey: string
    opts: { iss: string; sub: string; aud?: string }
  }[]
}

// Vectors shared with vlpds and generated from the reference: see
// tests/vectors/SOURCE.
const vectors: Vectors = JSON.parse(
  readFileSync(
    join(import.meta.dirname, 'vectors', 'spaces-alpha.json'),
    'utf8',
  ),
)

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

describe('spaces-alpha vectors', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(vectors.now * 1000)
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it.each(vectors.lthash)('LtHash %#', ({ ops, state, digest, empty }) => {
    const h = new LtHash()
    for (const [op, el] of ops) {
      if (op === '+') h.add(el)
      else h.remove(el)
    }
    expect(hex(h.state())).toBe(state)
    expect(hex(h.digest())).toBe(digest)
    expect(h.isEmpty()).toBe(empty)
  })

  it.each(vectors.commits)('historical commit set hash %#', async (v) => {
    const repo = new RepoCommit()
    for (const r of v.records) {
      const cid = parseCid(r.cid)
      expect(formatSetHashElement(r.collection, r.rkey, cid)).toBe(r.element)
      repo.add(r.collection, r.rkey, cid)
    }
    const hash = repo.setHash.digest()
    expect(hex(hash)).toBe(v.hash)
  })

  it.each(vectors.httpsig)('rejects pre-tag HTTP signature %#', async (v) => {
    await expect(
      verifyCredentialSig(v.headers, v.credentialKey ?? v.keyDid),
    ).rejects.toThrow()
  })

  it.each(vectors.tokens)('$type token %#', async (v) => {
    const header = JSON.parse(
      Buffer.from(v.jwt.split('.')[0], 'base64url').toString(),
    )
    if (header.kid === '#atproto_space') {
      await expect(
        verifySpaceToken(v.type, v.jwt, {
          getSigningKey: () => v.signingKey,
        }),
      ).rejects.toMatchObject({ code: 'BadJwt' })
      return
    }
    const token = await verifySpaceToken(v.type, v.jwt, {
      getSigningKey: () => v.signingKey,
      aud: v.opts.aud,
      sub: v.opts.sub,
    })
    expect(token.payload.iss).toBe(v.opts.iss)
    expect(token.payload.sub).toBe(v.opts.sub)
  })
})
