import { type SeedClient, TestNetworkNoAppView } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/* A community's banner lives in the community's own repo (OD-9). */
describe('community banner', () => {
  let network: TestNetworkNoAppView
  let sc: SeedClient
  let alice: string
  let bob: string
  let community: string

  const json = async (nsid: string, did: string, body: object) => {
    const res = await fetch(new URL(`/xrpc/${nsid}`, network.pds.url), {
      method: 'POST',
      headers: {
        ...sc.getHeaders(did as DidString),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as any }
  }

  const upload = async (did: string, bytes: Uint8Array, type: string) => {
    const url = new URL(
      '/xrpc/com.para.community.uploadBanner',
      network.pds.url,
    )
    url.searchParams.set('community', community)
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...sc.getHeaders(did as DidString), 'content-type': type },
      body: bytes,
    })
    return { status: res.status, body: (await res.json()) as any }
  }

  const profile = async () => {
    const url = new URL('/xrpc/com.atproto.repo.getRecord', network.pds.url)
    url.searchParams.set('repo', community)
    url.searchParams.set('collection', 'com.para.community.profile')
    url.searchParams.set('rkey', 'self')
    return ((await (await fetch(url)).json()) as any).value
  }

  const update = (did: string, banner?: string) =>
    json('com.para.community.act', did, {
      community,
      action: 'profile.update',
      profile: { name: 'Agua Limpia', quadrant: 'norte', banner },
    })

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'para_community_banner',
    })
    sc = network.getSeedClient()
    for (const name of ['alice', 'bob']) {
      await sc.createAccount(name, {
        handle: `${name}.test`,
        email: `${name}@test.com`,
        password: `${name}-pass`,
      })
    }
    alice = sc.dids.alice
    bob = sc.dids.bob
    const res = await json('com.para.community.create', alice, {
      name: 'Agua Limpia',
      slug: 'agua-limpia',
      quadrant: 'norte',
    })
    community = res.body.did
    await json('com.para.community.act', bob, {
      community,
      action: 'member.join',
    })
  })

  afterAll(async () => {
    await network.close()
  })

  it('lets only an owner upload', async () => {
    const res = await upload(bob, PNG, 'image/png')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('NotPermitted')
  })

  it('refuses anything but a PNG or JPEG', async () => {
    const res = await upload(alice, Buffer.from('not an image'), 'text/plain')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('InvalidBanner')
  })

  it('sets the banner through profile.update and serves the blob', async () => {
    const uploaded = await upload(alice, PNG, 'image/png')
    expect(uploaded.status).toBe(200)
    expect(uploaded.body.mimeType).toBe('image/png')

    const updated = await update(alice, uploaded.body.cid)
    expect(updated.status).toBe(200)
    const record = await profile()
    expect(record.banner).toMatchObject({
      $type: 'blob',
      mimeType: 'image/png',
      ref: { $link: uploaded.body.cid },
    })

    const blob = new URL('/xrpc/com.atproto.sync.getBlob', network.pds.url)
    blob.searchParams.set('did', community)
    blob.searchParams.set('cid', uploaded.body.cid)
    const served = await fetch(blob)
    expect(served.status).toBe(200)
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG)).toBe(true)
  })

  it('refuses a banner that was never uploaded to the community', async () => {
    const res = await update(
      alice,
      'bafkreidgvpkjawlxz6sffxzwgooowe5yt7i6wsyg236mfoks77nywkptdq',
    )
    expect(res.status).toBe(400)
    expect((await profile()).banner).toBeDefined()
  })

  it('removes the banner when an update leaves it out', async () => {
    expect((await update(alice)).status).toBe(200)
    expect((await profile()).banner).toBeUndefined()
  })
})
