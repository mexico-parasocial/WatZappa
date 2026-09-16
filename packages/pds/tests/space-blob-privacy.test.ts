// @ts-nocheck
import { mkdtemp, readFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import * as ui8 from 'uint8arrays'
import { Secp256k1Keypair } from '@atproto/crypto'
import { encode } from '@atproto/lex-cbor'
import { cidForCbor, parseCid } from '@atproto/lex-data'
import { BlobRef } from '@atproto/lexicon'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
// @NOTE the PDS under test is built from THIS worktree's source, and only the
// PLC mock (which has no PDS dependency) comes from dev-env, so the dependency
// overlay's copy from main is never exercised.
import { TestPlc } from '../../dev-env/src/plc.js'
import * as pds from '../src/index.js'

// Adapted manual port of upstream 907f41a7b ("dont serve space blobs through
// sync.getBlob"): a blob referenced only by permissioned-space records must
// not be served or listed through the public sync surface, while a blob shared
// with a public record stays available until that record goes away. Space
// records are created through the actor store because no space write route is
// enabled in this port.

describe('space blob privacy on public sync routes', () => {
  let plcServer
  let server
  let url
  let alice
  let token
  let spaceUri

  beforeAll(async () => {
    plcServer = await TestPlc.create({})
    const rotationKey = await Secp256k1Keypair.create({ exportable: true })
    const port = await freePort()
    url = `http://localhost:${port}`
    const env = {
      devMode: true,
      port,
      didPlcUrl: plcServer.url,
      recoveryDidKey: (await Secp256k1Keypair.create()).did(),
      adminPassword: 'admin-pass',
      jwtSecret: 'jwt-secret',
      serviceHandleDomains: ['.test'],
      bskyAppViewUrl: 'https://appview.invalid',
      bskyAppViewDid: 'did:example:invalid',
      bskyAppViewCdnUrlPattern: 'http://cdn.appview.com/%s/%s/%s',
      modServiceUrl: 'https://moderator.invalid',
      modServiceDid: 'did:example:invalid',
      plcRotationKeyK256PrivateKeyHex: ui8.toString(
        await rotationKey.export(),
        'hex',
      ),
      inviteRequired: false,
      disableSsrfProtection: true,
      serviceName: 'Test PDS',
      primaryColor: '#000000',
      primaryColorContrast: '#ffffff',
      errorColor: 'rgb(255, 0, 0)',
      logoUrl: 'data:image/svg+xml;base64,',
      homeUrl: 'https://example.com/',
      termsOfServiceUrl: 'https://example.com/tos',
      privacyPolicyUrl: 'https://example.com/privacy',
      supportUrl: 'https://example.com/support',
      dataDirectory: await mkdtemp(`${tmpdir()}/watzappa-pds-`),
      blobstoreDiskLocation: await mkdtemp(`${tmpdir()}/watzappa-blobstore-`),
    }
    server = await pds.PDS.create(pds.envToCfg(env), pds.envToSecrets(env))
    await server.start()

    const created = await xrpc('POST', 'com.atproto.server.createAccount', {
      body: {
        handle: 'alice.test',
        email: 'alice@test.com',
        password: 'alice-pass',
      },
    })
    expect(created.status).toBe(200)
    const account = await created.json()
    alice = account.did
    token = account.accessJwt

    spaceUri = AtUri.makeSpace(alice, 'com.para.space.personal', 'civic-tree')
      .spaceRef()
      .toString()
    await server.ctx.actorStore.transact(alice, async (store) => {
      await store.space.createSpace(spaceUri, {
        policy: 'member-list',
        managingApp: null,
        appAccessType: 'open',
        appAllowed: '[]',
      })
      await store.space.addMember(spaceUri, alice)
    })
  })

  afterAll(async () => {
    await server?.destroy()
    await plcServer?.close()
  })

  function xrpc(method, nsid, { query, body, contentType } = {}) {
    const params = new URLSearchParams(query)
    const suffix = params.toString() ? `?${params}` : ''
    return fetch(`${url}/xrpc/${nsid}${suffix}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body
          ? {
              'content-type': contentType ?? 'application/json',
            }
          : {}),
      },
      ...(body && !contentType ? { body: JSON.stringify(body) } : {}),
      ...(body && contentType ? { body } : {}),
    })
  }

  const recordUri = (rkey) =>
    AtUri.makeSpace(
      alice,
      'com.para.space.personal',
      'civic-tree',
      alice,
      'com.para.highlight',
      rkey,
    )

  async function attachBlobToSpaceRecord(blob, rkey) {
    const record = { $type: 'com.para.highlight', text: 'private' }
    const cid = await cidForCbor(encode(record))
    const ref = new BlobRef(parseCid(blob.ref.$link), blob.mimeType, blob.size)
    await server.ctx.actorStore.transact(alice, async (store) => {
      await store.space.applyWrites(spaceUri, [
        {
          action: WriteOpAction.Create,
          uri: recordUri(rkey),
          cid,
          swapCid: null,
          record,
          blobs: [ref],
          validationStatus: 'unknown',
        },
      ])
    })
    return ref
  }

  async function uploadPortrait() {
    return uploadAsset('../dev-env/assets/key-portrait-small.jpg')
  }

  async function uploadAsset(location) {
    const bytes = new Uint8Array(await readFile(location))
    const res = await xrpc('POST', 'com.atproto.repo.uploadBlob', {
      body: bytes,
      contentType: 'image/jpeg',
    })
    expect(res.status).toBe(200)
    return (await res.json()).blob
  }

  const publicGetBlobUrl = (blobCid) =>
    `${url}/xrpc/com.atproto.sync.getBlob?did=${alice}&cid=${blobCid}`

  it('does not serve or list a space-only blob through public sync', async () => {
    const blob = await uploadPortrait()
    const blobCid = blob.ref.$link

    await attachBlobToSpaceRecord(blob, 'private-blob')

    const listed = await xrpc('GET', 'com.atproto.sync.listBlobs', {
      query: { did: alice },
    })
    expect((await listed.json()).cids).not.toContain(blobCid)

    const res = await fetch(publicGetBlobUrl(blobCid))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'BlobNotFound',
    })

    // @NOTE the bytes remain stored and reachable for the space's own path.
    expect(await server.ctx.blobstore(alice).hasStored(parseCid(blobCid))).toBe(
      true,
    )
    const stored = await server.ctx.actorStore.read(alice, (store) =>
      store.repo.blob.getBlobCids(),
    )
    expect(stored.map((cid) => cid.toString())).toContain(blobCid)
  })

  it('keeps serving a blob shared with a public record until that record goes', async () => {
    const blob = await uploadAsset('../dev-env/assets/key-landscape-small.jpg')
    const blobCid = blob.ref.$link
    await attachBlobToSpaceRecord(blob, 'shared')

    const created = await xrpc('POST', 'com.atproto.repo.createRecord', {
      body: {
        repo: alice,
        collection: 'app.bsky.feed.post',
        record: {
          text: 'shared',
          createdAt: new Date().toISOString(),
          embed: {
            $type: 'app.bsky.embed.images',
            images: [{ image: blob, alt: 'shared' }],
          },
        },
      },
    })
    expect(created.status).toBe(200)
    const { uri } = await created.json()
    await server.ctx.backgroundQueue.processAll()
    expect((await fetch(publicGetBlobUrl(blobCid))).status).toBe(200)

    // Deleting the public record must not strand the space record's bytes.
    const deleted = await xrpc('POST', 'com.atproto.repo.deleteRecord', {
      body: {
        repo: alice,
        collection: 'app.bsky.feed.post',
        rkey: new AtUri(uri).rkey,
      },
    })
    expect(deleted.status).toBe(200)
    await server.ctx.backgroundQueue.processAll()
    expect(await server.ctx.blobstore(alice).hasStored(parseCid(blobCid))).toBe(
      true,
    )
    expect((await fetch(publicGetBlobUrl(blobCid))).status).toBe(400)

    // And the reverse: dropping the space record leaves nothing behind.
    const gone = { $type: 'com.para.highlight', text: 'gone' }
    await server.ctx.actorStore.transact(alice, async (store) => {
      await store.space.applyWrites(spaceUri, [
        {
          action: WriteOpAction.Delete,
          uri: recordUri('shared'),
          cid: await cidForCbor(encode(gone)),
          swapCid: null,
          record: gone,
          blobs: [],
          validationStatus: 'unknown',
        },
      ])
    })
    await server.ctx.backgroundQueue.processAll()
    expect(await server.ctx.blobstore(alice).hasStored(parseCid(blobCid))).toBe(
      false,
    )
  })
})

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, 'localhost', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}
