// @ts-nocheck
import { request } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'

/*
 * com.para.actor.exportCivicTree aggregates a user's votes, delegations and
 * highlights into a single document. It once accepted an arbitrary `actor`
 * param under optional auth, so any caller - including an unauthenticated one -
 * could export anyone's civic dossier.
 *
 * These tests pin the authorization, not the export format: the shape of the
 * vault is free to change, but who may ask for it is not.
 */

const NSID = 'com.para.actor.exportCivicTree'

const exportTree = async (
  network: TestNetwork,
  opts: { as?: string; actor?: string } = {},
) => {
  const url = new URL(`/xrpc/${NSID}`, network.bsky.url)
  if (opts.actor) url.searchParams.set('actor', opts.actor)

  const headers = opts.as
    ? await network.serviceHeaders(opts.as, NSID)
    : undefined

  const res = await request(url, { method: 'GET', headers })
  return { statusCode: res.statusCode, body: await res.body.json() }
}

describe('para civic tree export', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: string
  let bob: string

  beforeAll(async () => {
    const schemaSuffix = Array.from({ length: 8 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26)),
    ).join('')
    network = await TestNetwork.create({
      dbPostgresSchema: `bsky_views_para_civic_tree_export_${schemaSuffix}`,
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    alice = sc.dids.alice
    bob = sc.dids.bob

    await writeParaFixture(network, async () => {
      const board = await createCommunityBoardRecord(sc, alice, {
        name: 'MX Federal',
        quadrant: 'federal',
      })
      await createCommunityMembershipRecord(sc, alice, board.uri, 'active')
      await createCommunityMembershipRecord(sc, bob, board.uri, 'active')
    })
  })

  afterAll(async () => {
    await network?.close()
  })

  it('exports the caller own tree when no actor is given', async () => {
    const res = await exportTree(network, { as: alice })
    expect(res.statusCode).toEqual(200)
    expect(res.body.files).toBeDefined()
    expect(res.body.summary).toBeDefined()
  })

  it('accepts an actor param naming the caller themselves', async () => {
    const res = await exportTree(network, { as: alice, actor: alice })
    expect(res.statusCode).toEqual(200)
    expect(res.body.files).toBeDefined()
  })

  it('refuses to export another account tree', async () => {
    const res = await exportTree(network, { as: bob, actor: alice })
    expect(res.statusCode).not.toEqual(200)
    expect(res.body.error).toEqual('Forbidden')
  })

  it('refuses an unauthenticated export', async () => {
    const res = await exportTree(network, { actor: alice })
    expect(res.statusCode).not.toEqual(200)
  })

  it('attributes the export to the caller, not to a community creator', async () => {
    const res = await exportTree(network, { as: bob })
    expect(res.statusCode).toEqual(200)

    const readme = res.body.files.find((f) => f.path === 'README.md')
    expect(readme.content).toContain(`actorDid: "${bob}"`)
    expect(readme.content).not.toContain(`actorDid: "${alice}"`)

    /*
     * Alice's DID legitimately appears inside Bob's export - she created the
     * board he belongs to, so his own membership record points at her repo.
     * What must never appear is a record Bob does not own, so assert on the
     * ownership of the records themselves rather than on the raw text.
     */
    for (const file of res.body.files) {
      const membershipUri = file.content.match(/membershipUri: "([^"]+)"/)?.[1]
      if (membershipUri) {
        expect(membershipUri.startsWith(`at://${bob}/`)).toBe(true)
      }
    }
  })
})
