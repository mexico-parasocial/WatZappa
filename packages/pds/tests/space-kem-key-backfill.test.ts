import fs from 'node:fs/promises'
import { Secp256k1Keypair } from '@atproto/crypto'
import { type SeedClient, TestNetworkNoAppView } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import { KemKeyBackfill } from '../src/kem-key-backfill.js'

describe('account KEM key provisioning', () => {
  let network: TestNetworkNoAppView
  let sc: SeedClient
  let alice: DidString
  let bob: DidString

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({})
    sc = network.getSeedClient()
    alice = (
      await sc.createAccount('alice', {
        handle: 'kem-alice.test',
        email: 'alice@kem.test',
        password: 'kem-password',
      })
    ).did
    bob = (
      await sc.createAccount('bob', {
        handle: 'kem-bob.test',
        email: 'bob@kem.test',
        password: 'kem-password',
      })
    ).did
  })

  afterAll(async () => {
    await network?.close()
  })

  beforeEach(async () => {
    await network.pds.ctx.accountManager.db.db
      .updateTable('kem_key_backfill_lease')
      .set({ owner: '', expiresAt: 0, completedAt: null })
      .where('id', '=', 1)
      .execute()
  })

  it('publishes a new account KEM key with its genesis operation', async () => {
    const ctx = network.pds.ctx
    const key = await ctx.actorStore.kemKeypair(alice)
    const doc = await ctx.plcClient.getDocumentData(alice)
    expect(key).toBeDefined()
    expect(doc.verificationMethods.atproto_kem).toBe(key!.did())
    expect(doc.verificationMethods.atproto).toBe(
      (await ctx.actorStore.keypair(alice)).did(),
    )
    const { kemKeyLocation } = await ctx.actorStore.getLocation(alice)
    expect((await fs.stat(kemKeyLocation)).mode & 0o777).toBe(0o600)
  })

  it('backfills an alpha account and keeps the key on a subsequent run', async () => {
    const ctx = network.pds.ctx
    const { kemKeyLocation } = await ctx.actorStore.getLocation(alice)
    await fs.unlink(kemKeyLocation)
    await ctx.plcClient.updateData(alice, ctx.plcRotationKey, (op) => {
      const verificationMethods = { ...op.verificationMethods }
      delete verificationMethods.atproto_kem
      return { ...op, verificationMethods }
    })
    await using backfill = new KemKeyBackfill(ctx)
    await backfill.run()
    const key = await ctx.actorStore.kemKeypair(alice)
    expect(
      (await ctx.plcClient.getDocumentData(alice)).verificationMethods
        .atproto_kem,
    ).toBe(key!.did())
    expect((await fs.stat(kemKeyLocation)).mode & 0o777).toBe(0o600)
    await backfill.run()
    expect((await ctx.actorStore.kemKeypair(alice))!.did()).toBe(key!.did())
  })

  it('provides a local key for manual publication when the PDS lacks rotation authority', async () => {
    const ctx = network.pds.ctx
    const { kemKeyLocation } = await ctx.actorStore.getLocation(bob)
    await fs.unlink(kemKeyLocation)
    const external = await Secp256k1Keypair.create()
    await ctx.plcClient.updateData(bob, ctx.plcRotationKey, (op) => {
      const verificationMethods = { ...op.verificationMethods }
      delete verificationMethods.atproto_kem
      return { ...op, verificationMethods, rotationKeys: [external.did()] }
    })
    await using backfill = new KemKeyBackfill(ctx)
    await backfill.run()
    expect(await ctx.actorStore.kemKeypair(bob)).toBeDefined()
    expect(
      (await ctx.plcClient.getDocumentData(bob)).verificationMethods
        .atproto_kem,
    ).toBeUndefined()
  })
})
