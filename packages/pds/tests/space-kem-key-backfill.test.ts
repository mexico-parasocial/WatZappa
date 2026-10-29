import fs from 'node:fs/promises'
import { jest } from '@jest/globals'
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

  it('retains the published key when the PLC response is lost', async () => {
    const ctx = network.pds.ctx
    const { kemKeyLocation } = await ctx.actorStore.getLocation(alice)
    await fs.unlink(kemKeyLocation)
    await ctx.plcClient.updateData(alice, ctx.plcRotationKey, (op) => {
      const verificationMethods = { ...op.verificationMethods }
      delete verificationMethods.atproto_kem
      return { ...op, verificationMethods }
    })
    const update = ctx.plcClient.updateData.bind(ctx.plcClient)
    let firstPublished: string | undefined
    using spy = jest
      .spyOn(ctx.plcClient, 'updateData')
      .mockImplementation(async (...args) => {
        const result = await update(...args)
        if (args[0] === alice && !firstPublished) {
          firstPublished = (await ctx.plcClient.getDocumentData(alice))
            .verificationMethods.atproto_kem
          throw new Error('PLC response lost after commit')
        }
        return result
      })
    await using backfill = new KemKeyBackfill(ctx, {
      leaseMs: 60_000,
      pollMs: 1,
    })
    await backfill.run()
    const key = await ctx.actorStore.kemKeypair(alice)
    expect(firstPublished).toBeDefined()
    expect(key!.did()).toBe(firstPublished)
    expect(
      (await ctx.plcClient.getDocumentData(alice)).verificationMethods
        .atproto_kem,
    ).toBe(firstPublished)
    expect(spy).toHaveBeenCalled()
  })

  it('keeps the same key when an expired worker resumes after another completes', async () => {
    const ctx = network.pds.ctx
    const { kemKeyLocation } = await ctx.actorStore.getLocation(alice)
    await fs.unlink(kemKeyLocation)
    await ctx.plcClient.updateData(alice, ctx.plcRotationKey, (op) => {
      const verificationMethods = { ...op.verificationMethods }
      delete verificationMethods.atproto_kem
      return { ...op, verificationMethods }
    })
    let signalEntered!: () => void
    let signalResume!: () => void
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve
    })
    const resume = new Promise<void>((resolve) => {
      signalResume = resolve
    })
    const getLastOp = ctx.plcClient.getLastOp.bind(ctx.plcClient)
    let blocked = false
    using spy = jest
      .spyOn(ctx.plcClient, 'getLastOp')
      .mockImplementation(async (did) => {
        const op = await getLastOp(did)
        if (did === alice && !blocked) {
          blocked = true
          signalEntered()
          await resume
        }
        return op
      })
    await using first = new KemKeyBackfill(ctx, { leaseMs: 60_000, pollMs: 1 })
    await using second = new KemKeyBackfill(ctx, { leaseMs: 60_000, pollMs: 1 })
    const firstRun = first.run()
    try {
      await entered
      await ctx.accountManager.db.db
        .updateTable('kem_key_backfill_lease')
        .set({ expiresAt: 0 })
        .where('id', '=', 1)
        .execute()
      await second.run()
    } finally {
      signalResume()
      await firstRun
    }
    const key = await ctx.actorStore.kemKeypair(alice)
    expect(key).toBeDefined()
    expect(
      (await ctx.plcClient.getDocumentData(alice)).verificationMethods
        .atproto_kem,
    ).toBe(key!.did())
    expect(spy).toHaveBeenCalled()
  })

  it('does not replace a completed key when a stalled worker installs its pending key late', async () => {
    const ctx = network.pds.ctx
    const { kemKeyLocation } = await ctx.actorStore.getLocation(alice)
    await fs.unlink(kemKeyLocation)
    await fs.rm(`${kemKeyLocation}.backfill-pending`, { force: true })
    await ctx.plcClient.updateData(alice, ctx.plcRotationKey, (op) => {
      const verificationMethods = { ...op.verificationMethods }
      delete verificationMethods.atproto_kem
      return { ...op, verificationMethods }
    })
    let signalEntered!: () => void
    let signalResume!: () => void
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve
    })
    const resume = new Promise<void>((resolve) => {
      signalResume = resolve
    })
    const link = fs.link.bind(fs)
    let blocked = false
    using spy = jest
      .spyOn(fs, 'link')
      .mockImplementation(async (source, destination) => {
        if (destination === `${kemKeyLocation}.backfill-pending` && !blocked) {
          blocked = true
          signalEntered()
          await resume
        }
        return link(source, destination)
      })
    await using first = new KemKeyBackfill(ctx, { leaseMs: 60_000, pollMs: 1 })
    await using second = new KemKeyBackfill(ctx, { leaseMs: 60_000, pollMs: 1 })
    const firstRun = first.run()
    try {
      await entered
      await ctx.accountManager.db.db
        .updateTable('kem_key_backfill_lease')
        .set({ expiresAt: 0 })
        .where('id', '=', 1)
        .execute()
      await second.run()
    } finally {
      signalResume()
      await firstRun
    }
    const key = await ctx.actorStore.kemKeypair(alice)
    expect(
      (await ctx.plcClient.getDocumentData(alice)).verificationMethods
        .atproto_kem,
    ).toBe(key!.did())
    expect(await fs.readFile(`${kemKeyLocation}.backfill-pending`)).toEqual(
      await fs.readFile(kemKeyLocation),
    )
    expect(spy).toHaveBeenCalled()
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
