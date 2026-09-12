import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Server as XrpcServer } from '@atproto/xrpc-server'
import { describe, expect, it } from 'vitest'

// Ensures the com.para.* XRPC surface stays coherent:
//  - every method lexicon under lexicons/com/para is either served by this
//    AppView or explicitly listed in lexicon-exceptions.json, and
//  - nothing is registered on the server without a lexicon (the ghost-handler
//    failure mode, e.g. the removed com.para.discourse.getSentiment).
//
// The real API module is invoked against an empty server with a stub context:
// handlers only touch `ctx.authVerifier` (and `ctx.bskyAppView` truthiness) at
// registration time, so no infrastructure is needed. Registrations are
// captured by intercepting `server.method`.

const LEXICONS_DIR = join(__dirname, '../../../lexicons/com/para')
const EXCEPTIONS_PATH = join(
  __dirname,
  '../src/api/com/para/lexicon-exceptions.json',
)

type MethodLexicon = { id: string; defs: { main: { type: string } } }

const collectMethodLexicons = (
  dir: string,
  acc: Map<string, string> = new Map(),
): Map<string, string> => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectMethodLexicons(path, acc)
    } else if (entry.name.endsWith('.json')) {
      const doc = JSON.parse(readFileSync(path, 'utf8')) as MethodLexicon
      const type = doc.defs?.main?.type
      if (type === 'query' || type === 'procedure' || type === 'subscription') {
        acc.set(doc.id, type)
      }
    }
  }
  return acc
}

const ctxStub = {
  authVerifier: new Proxy(
    {},
    {
      get: () => () => () => {},
    },
  ),
  bskyAppView: { client: {} },
} as unknown as Parameters<typeof api>[1]

// eslint-disable-next-line import/order
import api from '../src/api/index.js'

describe('com.para lexicon parity', () => {
  const lexiconMethods = collectMethodLexicons(LEXICONS_DIR)
  const exceptions: Record<string, string> = JSON.parse(
    readFileSync(EXCEPTIONS_PATH, 'utf8'),
  )

  const server = new XrpcServer()
  const registered = new Set<string>()
  const record = (nsid: string, register: () => void) => {
    if (nsid.startsWith('com.para.')) registered.add(nsid)
    register()
  }
  server.method = ((nsid: string, cfg: unknown) =>
    record(nsid, () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (XrpcServer.prototype.method as any).call(server, nsid, cfg),
    ) as void) as typeof server.method
  server.add = (
    schema: { id?: string; $id?: string; $lxm?: string },
    cfg: unknown,
  ) =>
    record(String(schema?.$lxm ?? schema?.id ?? schema?.$id ?? ''), () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (XrpcServer.prototype.add as any).call(server, schema, cfg),
    ) as void
  server.addStreamMethod = ((nsid: string, cfg: unknown) =>
    record(nsid, () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (XrpcServer.prototype.addStreamMethod as any).call(server, nsid, cfg),
    ) as void) as typeof server.addStreamMethod

  api(server, ctxStub)

  it('registers an XRPC surface (sanity)', () => {
    expect(registered.size).toBeGreaterThan(0)
  })

  it('registers every lexicon method or lists it as an exception', () => {
    const missing = [...lexiconMethods.keys()].filter(
      (nsid) => !registered.has(nsid) && !(nsid in exceptions),
    )
    expect(missing).toEqual([])
  })

  it('does not register methods without a lexicon', () => {
    const ghosts = [...registered].filter((nsid) => !lexiconMethods.has(nsid))
    expect(ghosts).toEqual([])
  })

  it('does not list stale exceptions', () => {
    const stale = Object.keys(exceptions).filter(
      (nsid) => !nsid.startsWith('$') && !lexiconMethods.has(nsid),
    )
    expect(stale).toEqual([])
  })

  it('does not list exceptions for methods that are registered', () => {
    const pointless = Object.keys(exceptions).filter((nsid) =>
      registered.has(nsid),
    )
    expect(pointless).toEqual([])
  })
})
