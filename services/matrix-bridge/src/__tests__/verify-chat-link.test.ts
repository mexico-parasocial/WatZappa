import { describe, expect, it, vi } from 'vitest'
import { verifyChatLink } from '../verify-chat-link.js'

const PARA = 'did:plc:parauser'
const LINKED = 'did:web:solidarity.example'

/** Minimal fake resolver + fetch serving canned listRecords responses. */
function harness(recordsByDid: Record<string, unknown[]>) {
  const resolver = {
    resolve: vi.fn(async (did: string) => ({
      service: [
        {
          id: '#atproto_pds',
          serviceEndpoint: `https://pds-${did.replace(/[^a-z0-9]/gi, '').slice(0, 16)}.test`,
        },
      ],
    })),
  } as unknown as Parameters<typeof verifyChatLink>[0]['resolver']

  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const did = url.searchParams.get('repo') ?? ''
    return new Response(
      JSON.stringify({
        records: (recordsByDid[did] ?? []).map((value) => ({ value })),
      }),
      { status: 200 },
    )
  }) as unknown as typeof fetch

  return { resolver, fetchImpl }
}

const paraRecord = {
  provider: 'solidarity.social',
  matrixUserId: '@ana:matrix.solidarity.social',
  linkedAt: '2026-09-01T00:00:00Z',
}
const reciprocal = {
  provider: 'solidarity.social',
  matrixUserId: '@ana:matrix.solidarity.social',
  paraDid: PARA,
  linkedAt: '2026-09-01T00:00:00Z',
}

describe('verifyChatLink', () => {
  it('verifies a reciprocal two-sided link', async () => {
    const { resolver, fetchImpl } = harness({
      [PARA]: [paraRecord],
      [LINKED]: [reciprocal],
    })
    const verdict = await verifyChatLink({
      paraDid: PARA,
      linkedDid: LINKED,
      resolver,
      fetchImpl,
    })
    expect(verdict).toEqual({
      ok: true,
      provider: 'solidarity.social',
      matrixUserId: '@ana:matrix.solidarity.social',
    })
  })

  it('rejects when the PARA side has no record', async () => {
    const { resolver, fetchImpl } = harness({ [LINKED]: [reciprocal] })
    const verdict = await verifyChatLink({
      paraDid: PARA,
      linkedDid: LINKED,
      resolver,
      fetchImpl,
    })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('no-para-record')
  })

  it('rejects a one-sided claim (no reciprocal record)', async () => {
    const { resolver, fetchImpl } = harness({
      [PARA]: [paraRecord],
      [LINKED]: [],
    })
    const verdict = await verifyChatLink({
      paraDid: PARA,
      linkedDid: LINKED,
      resolver,
      fetchImpl,
    })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('no-reciprocal-record')
  })

  it('rejects a reciprocal record naming a different PARA DID', async () => {
    const stranger = { ...reciprocal, paraDid: 'did:plc:someoneelse' }
    const { resolver, fetchImpl } = harness({
      [PARA]: [paraRecord],
      [LINKED]: [stranger],
    })
    const verdict = await verifyChatLink({
      paraDid: PARA,
      linkedDid: LINKED,
      resolver,
      fetchImpl,
    })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('no-reciprocal-record')
  })
})
