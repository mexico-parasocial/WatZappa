import { randomUUID } from 'node:crypto'
import { type SeedClient, TestNetworkNoAppView } from '@atproto/dev-env'
import { verifyRepoCarFull } from '@atproto/space'
import type { DidString } from '@atproto/syntax'
import { getMigrator } from '../src/actor-store/db/index.js'
import basicSeed from './seeds/basic.js'

/*
 * The repo-host half of atproto Spaces (api/com/atproto/space): an account's own
 * space repos, behind PDS_SPACES_ENABLED, OAuth sessions only (CD-P3).
 *
 * OAuth tokens are stubbed rather than minted through a browser flow, the
 * reference PDS's approach: `authenticateRequest` is replaced, so the scope
 * check, the handlers and storage are all real. A request has to present a DPoP
 * authorization header to take the OAuth path at all.
 */

const SPACE_TYPE = 'com.example.group'
const COLLECTION = 'com.example.note'
const OTHER_COLLECTION = 'com.example.other'

type Res = { status: number; body: any; bytes: Uint8Array }

describe('spaces', () => {
  let network: TestNetworkNoAppView
  let sc: SeedClient
  let alice: DidString
  let bob: DidString
  let carol: DidString

  // Set per call by asOAuth and read by the stub.
  let oauth: { did: string; scope: string } | undefined

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'spaces',
      pds: { spacesEnabled: true },
    })
    sc = network.getSeedClient()
    await basicSeed(sc)
    alice = sc.dids.alice as DidString
    bob = sc.dids.bob as DidString
    carol = sc.dids.carol as DidString

    const verifier = network.pds.ctx.authVerifier.oauthVerifier
    const real = verifier.authenticateRequest.bind(verifier)
    verifier.authenticateRequest = (async (...args: unknown[]) => {
      if (!oauth) return (real as (...a: unknown[]) => unknown)(...args)
      return { sub: oauth.did, scope: oauth.scope }
    }) as typeof verifier.authenticateRequest
  })

  afterAll(async () => {
    await network.close()
  })

  const spaceOf = (authority: string, skey = 'self') =>
    `at://${authority}/space/${SPACE_TYPE}/${skey}`

  const grant = (authority: string, params: string) =>
    `atproto space:${SPACE_TYPE}?authority=${authority}&${params}`

  const fullGrant = (authority: string) =>
    grant(
      authority,
      `collection=${COLLECTION}&action=read&action=create&action=update&action=delete`,
    )

  const call = async (
    nsid: string,
    opts: {
      headers?: Record<string, string>
      params?: Record<string, string | number | boolean>
      body?: unknown
    } = {},
  ): Promise<Res> => {
    const url = new URL(`/xrpc/${nsid}`, network.pds.url)
    for (const [key, value] of Object.entries(opts.params ?? {})) {
      url.searchParams.set(key, String(value))
    }
    const res = await fetch(url, {
      method: opts.body === undefined ? 'GET' : 'POST',
      headers: {
        ...opts.headers,
        ...(opts.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    const bytes = new Uint8Array(await res.arrayBuffer())
    let body: any
    try {
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      body = undefined
    }
    return { status: res.status, body, bytes }
  }

  const asOAuth = async <T>(
    did: string,
    scope: string,
    fn: (headers: Record<string, string>) => Promise<T>,
  ): Promise<T> => {
    oauth = { did, scope }
    try {
      return await fn({ authorization: 'DPoP test-oauth-token' })
    } finally {
      oauth = undefined
    }
  }

  const note = (text: string) => ({ $type: COLLECTION, text })

  const create = (
    headers: Record<string, string>,
    did: string,
    space: string,
    rkey: string,
    record: unknown = note(rkey),
    collection = COLLECTION,
  ) =>
    call('com.atproto.space.createRecord', {
      headers,
      body: { space, repo: did, collection, rkey, record },
    })

  describe('own space repo, over OAuth', () => {
    it('writes, reads, lists, updates and deletes a record', async () => {
      const space = spaceOf(alice, 'crud')
      await asOAuth(alice, fullGrant(alice), async (headers) => {
        const created = await create(headers, alice, space, 'one')
        expect(created.status).toBe(200)
        expect(created.body.uri).toBe(`${space}/${alice}/${COLLECTION}/one`)
        expect(created.body.validationStatus).toBe('unknown')

        const got = await call('com.atproto.space.getRecord', {
          headers,
          params: { space, repo: alice, collection: COLLECTION, rkey: 'one' },
        })
        expect(got.status).toBe(200)
        expect(got.body.value).toEqual(note('one'))
        expect(got.body.cid).toBe(created.body.cid)

        const put = await call('com.atproto.space.putRecord', {
          headers,
          body: {
            space,
            repo: alice,
            collection: COLLECTION,
            rkey: 'one',
            record: note('one, edited'),
          },
        })
        expect(put.status).toBe(200)
        expect(put.body.cid).not.toBe(created.body.cid)

        await create(headers, alice, space, 'two')
        const listed = await call('com.atproto.space.listRecords', {
          headers,
          params: { space, repo: alice },
        })
        expect(listed.status).toBe(200)
        expect(listed.body.records.map((r: any) => r.rkey).sort()).toEqual([
          'one',
          'two',
        ])

        const deleted = await call('com.atproto.space.deleteRecord', {
          headers,
          body: { space, repo: alice, collection: COLLECTION, rkey: 'two' },
        })
        expect(deleted.status).toBe(200)
        // Idempotent, as com.atproto.repo.deleteRecord is.
        const again = await call('com.atproto.space.deleteRecord', {
          headers,
          body: { space, repo: alice, collection: COLLECTION, rkey: 'two' },
        })
        expect(again.status).toBe(200)

        const gone = await call('com.atproto.space.getRecord', {
          headers,
          params: { space, repo: alice, collection: COLLECTION, rkey: 'two' },
        })
        expect(gone.status).toBe(400)
        expect(gone.body.error).toBe('RecordNotFound')
      })
    })

    it('applies a batch as one revision', async () => {
      const space = spaceOf(alice, 'batch')
      await asOAuth(alice, fullGrant(alice), async (headers) => {
        const res = await call('com.atproto.space.applyWrites', {
          headers,
          body: {
            space,
            repo: alice,
            writes: [
              {
                $type: 'com.atproto.space.applyWrites#create',
                collection: COLLECTION,
                rkey: 'a',
                value: note('a'),
              },
              {
                $type: 'com.atproto.space.applyWrites#create',
                collection: COLLECTION,
                rkey: 'b',
                value: note('b'),
              },
            ],
          },
        })
        expect(res.status).toBe(200)
        expect(res.body.results).toHaveLength(2)

        const ops = await call('com.atproto.space.listRepoOps', {
          headers,
          params: { space, repo: alice },
        })
        expect(ops.status).toBe(200)
        expect(ops.body.ops).toHaveLength(2)
        expect(new Set(ops.body.ops.map((op: any) => op.rev)).size).toBe(1)
        expect(ops.body.commit).toBeDefined()
      })
    })

    it('serves a repo that verifies against the account key', async () => {
      const space = spaceOf(alice, 'export')
      await asOAuth(alice, fullGrant(alice), async (headers) => {
        await create(headers, alice, space, 'x')
        await create(headers, alice, space, 'y')

        const latest = await call('com.atproto.space.getLatestCommit', {
          headers,
          params: { space, repo: alice },
        })
        expect(latest.status).toBe(200)

        const car = await call('com.atproto.space.getRepo', {
          headers,
          params: { space, repo: alice },
        })
        expect(car.status).toBe(200)
        const keypair = await network.pds.ctx.actorStore.keypair(alice)
        const verified = await verifyRepoCarFull([car.bytes], {
          space,
          author: alice,
          didKey: keypair.did(),
        })
        expect(verified.records.map((r) => r.rkey).sort()).toEqual(['x', 'y'])
        expect(verified.commit.rev).toBe(latest.body.commit.rev)
      })
    })

    it('migrates a store created before Spaces on first use', async () => {
      const store = network.pds.ctx.actorStore
      const db = await store.openDb(carol)
      try {
        await getMigrator(db).migrateToOrThrow('001')
      } finally {
        db.close()
      }
      ;(store as unknown as { upToDate: Set<string> }).upToDate.delete(carol)

      await asOAuth(carol, fullGrant(carol), async (headers) => {
        const res = await create(headers, carol, spaceOf(carol), 'first')
        expect(res.status).toBe(200)
      })
    })
  })

  describe('refusals', () => {
    it('refuses a password session (CD-P3)', async () => {
      const headers = sc.getHeaders(alice)
      const write = await create(headers, alice, spaceOf(alice), 'nope')
      expect(write.status).toBe(401)
      expect(write.body.error).toBe('OAuthRequired')

      const read = await call('com.atproto.space.listRecords', {
        headers,
        params: { space: spaceOf(alice), repo: alice },
      })
      expect(read.status).toBe(401)
      expect(read.body.error).toBe('OAuthRequired')
    })

    it('refuses a legacy OAuth token without a space grant', async () => {
      await asOAuth(alice, 'atproto transition:generic', async (headers) => {
        const res = await create(headers, alice, spaceOf(alice), 'legacy')
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.body.message).toMatch(/space:/)
      })
    })

    it('enforces the collection and action a grant names', async () => {
      const space = spaceOf(alice, 'scoped')
      const createOnly = grant(alice, `collection=${COLLECTION}&action=create`)
      await asOAuth(alice, createOnly, async (headers) => {
        expect((await create(headers, alice, space, 'ok')).status).toBe(200)

        const otherCollection = await create(
          headers,
          alice,
          space,
          'no',
          { $type: OTHER_COLLECTION, text: 'no' },
          OTHER_COLLECTION,
        )
        expect(otherCollection.status).toBeGreaterThanOrEqual(400)
        expect(otherCollection.body.message).toMatch(/space:/)

        const del = await call('com.atproto.space.deleteRecord', {
          headers,
          body: { space, repo: alice, collection: COLLECTION, rkey: 'ok' },
        })
        expect(del.status).toBeGreaterThanOrEqual(400)
        expect(del.body.message).toMatch(/space:/)

        const read = await call('com.atproto.space.listRecords', {
          headers,
          params: { space, repo: alice },
        })
        expect(read.status).toBeGreaterThanOrEqual(400)
        expect(read.body.message).toMatch(/space:/)
      })
    })

    it('refuses a write into a space another account governs', async () => {
      const space = spaceOf(bob)
      await asOAuth(alice, fullGrant(bob), async (headers) => {
        const res = await create(headers, alice, space, 'foreign')
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('SpaceNotSupported')
      })
    })

    it('refuses a write to another account repo', async () => {
      await asOAuth(alice, fullGrant(bob), async (headers) => {
        const res = await create(headers, bob, spaceOf(bob), 'impersonated')
        expect(res.status).toBe(403)
      })
    })

    it('does not reveal another account repo', async () => {
      const space = spaceOf(alice, 'private')
      await asOAuth(alice, fullGrant(alice), (headers) =>
        create(headers, alice, space, 'mine'),
      )
      await asOAuth(bob, fullGrant(alice), async (headers) => {
        const res = await call('com.atproto.space.getRecord', {
          headers,
          params: { space, repo: alice, collection: COLLECTION, rkey: 'mine' },
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('RepoNotFound')
      })
    })

    it('refuses a record that references a blob', async () => {
      await asOAuth(alice, fullGrant(alice), async (headers) => {
        const res = await create(headers, alice, spaceOf(alice), 'blob', {
          $type: COLLECTION,
          text: 'with a blob',
          image: {
            $type: 'blob',
            ref: {
              $link:
                'bafkreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm',
            },
            mimeType: 'image/png',
            size: 4,
          },
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('SpaceBlobsNotSupported')
      })
    })

    it('answers 501 for a Spaces method it does not implement', async () => {
      const res = await call('com.atproto.space.getSpaceCredential', {
        headers: sc.getHeaders(alice),
        params: { space: spaceOf(alice) },
      })
      expect(res.status).toBe(501)
      expect(res.body.error).toBe('MethodNotImplemented')
    })

    it('never mints service auth for a Spaces method', async () => {
      const res = await call('com.atproto.server.getServiceAuth', {
        headers: sc.getHeaders(alice),
        params: {
          aud: 'did:web:authority.example',
          lxm: 'com.atproto.space.notifyWrite',
        },
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Spaces method/)
    })
  })

  describe('simplespace host, owner only', () => {
    const PERSONAL = 'com.para.space.personal'
    const RECORD = 'com.para.collection.record'
    const memberList = {
      $type: 'com.atproto.simplespace.defs#memberListPolicy',
    }
    const open = { $type: 'com.atproto.simplespace.defs#open' }
    const ownerGrant = (did: string) =>
      `atproto space:${PERSONAL}?authority=${did}&collection=${RECORD}` +
      '&action=read&action=create&action=update&action=delete' +
      '&manage=create&manage=update&manage=delete'

    const createSpace = (
      headers: Record<string, string>,
      skey: string,
      readPolicy: unknown = memberList,
    ) =>
      call('com.atproto.simplespace.createSpace', {
        headers,
        body: {
          spaceType: PERSONAL,
          skey,
          readPolicy,
          writePolicy: memberList,
          appAccess: open,
        },
      })

    const collection = (name: string) => ({
      $type: RECORD,
      name,
      items: [
        { kind: 'note', note: 'private', addedAt: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
    })

    it('creates, reads, reconfigures and deletes an owned space', async () => {
      await asOAuth(alice, ownerGrant(alice), async (headers) => {
        const created = await createSpace(headers, 'lifecycle')
        expect(created.status).toBe(200)
        const space = created.body.uri
        expect(space).toBe(`at://${alice}/space/${PERSONAL}/lifecycle`)

        const again = await createSpace(headers, 'lifecycle')
        expect(again.status).toBe(400)
        expect(again.body.error).toBe('SpaceAlreadyExists')

        const got = await call('com.atproto.simplespace.getSpace', {
          headers,
          params: { space },
        })
        expect(got.status).toBe(200)
        expect(got.body.readPolicy.$type).toBe(memberList.$type)
        expect(got.body.writePolicy.$type).toBe(memberList.$type)

        const updated = await call('com.atproto.simplespace.updateSpace', {
          headers,
          body: {
            space,
            appAccess: {
              $type: 'com.atproto.simplespace.defs#allowList',
              allowed: ['https://para.example/client-metadata.json'],
            },
          },
        })
        expect(updated.status).toBe(200)

        const members = await call('com.atproto.simplespace.listMembers', {
          headers,
          params: { space },
        })
        expect(members.status).toBe(200)
        expect(members.body.members).toEqual([])

        const written = await call('com.atproto.space.createRecord', {
          headers,
          body: {
            space,
            repo: alice,
            collection: RECORD,
            rkey: 'kept-until-delete',
            record: collection('Lecturas'),
          },
        })
        expect(written.status).toBe(200)

        const deleted = await call('com.atproto.simplespace.deleteSpace', {
          headers,
          body: { space },
        })
        expect(deleted.status).toBe(200)

        const gone = await call('com.atproto.simplespace.getSpace', {
          headers,
          params: { space },
        })
        expect(gone.status).toBe(400)
        expect(gone.body.error).toBe('SpaceNotFound')

        // The owner's own repo in the space goes with it.
        const record = await call('com.atproto.space.getRecord', {
          headers,
          params: {
            space,
            repo: alice,
            collection: RECORD,
            rkey: 'kept-until-delete',
          },
        })
        expect(record.body.error).toBe('RecordNotFound')
      })
    })

    it('accepts only a member-list policy', async () => {
      await asOAuth(alice, ownerGrant(alice), async (headers) => {
        const pub = await createSpace(headers, 'public', {
          $type: 'com.atproto.simplespace.defs#publicPolicy',
        })
        expect(pub.status).toBe(400)
        expect(pub.body.error).toBe('UnsupportedPolicy')

        const space = (await createSpace(headers, 'stays-private')).body.uri
        const opened = await call('com.atproto.simplespace.updateSpace', {
          headers,
          body: {
            space,
            readPolicy: { $type: 'com.atproto.simplespace.defs#publicPolicy' },
          },
        })
        expect(opened.status).toBe(400)
        expect(opened.body.error).toBe('UnsupportedPolicy')
      })
    })

    it('requires a manage grant and ownership', async () => {
      const readOnly = `atproto space:${PERSONAL}?authority=${alice}&action=read`
      await asOAuth(alice, readOnly, async (headers) => {
        const res = await createSpace(headers, 'no-manage')
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.body.message).toMatch(/space:/)
      })

      const space = await asOAuth(
        alice,
        ownerGrant(alice),
        async (headers) => (await createSpace(headers, 'owned')).body.uri,
      )
      await asOAuth(bob, ownerGrant(alice), async (headers) => {
        const res = await call('com.atproto.simplespace.getSpace', {
          headers,
          params: { space },
        })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('NotSpaceOwner')
      })

      const password = await call('com.atproto.simplespace.createSpace', {
        headers: sc.getHeaders(alice),
        body: {
          spaceType: PERSONAL,
          readPolicy: memberList,
          writePolicy: memberList,
          appAccess: open,
        },
      })
      expect(password.status).toBe(401)
      expect(password.body.error).toBe('OAuthRequired')
    })

    it('does not add members yet', async () => {
      const res = await call('com.atproto.simplespace.putMember', {
        headers: sc.getHeaders(alice),
        body: {
          space: `at://${alice}/space/${PERSONAL}/civic-tree`,
          did: bob,
          read: true,
          write: false,
        },
      })
      expect(res.status).toBe(501)
    })

    it('validates a collection record in the personal space', async () => {
      await asOAuth(alice, ownerGrant(alice), async (headers) => {
        const space = (await createSpace(headers, 'civic-tree')).body.uri
        const ok = await call('com.atproto.space.createRecord', {
          headers,
          body: {
            space,
            repo: alice,
            collection: RECORD,
            rkey: 'reading-list',
            record: collection('Lecturas'),
          },
        })
        expect(ok.status).toBe(200)
        expect(ok.body.validationStatus).toBe('valid')

        const invalid = await call('com.atproto.space.createRecord', {
          headers,
          body: {
            space,
            repo: alice,
            collection: RECORD,
            rkey: 'no-name',
            record: {
              $type: RECORD,
              items: [],
              createdAt: new Date().toISOString(),
            },
          },
        })
        expect(invalid.status).toBe(400)
      })
    })

    it('refuses a collection record in the public repo', async () => {
      const res = await call('com.atproto.repo.createRecord', {
        headers: sc.getHeaders(alice),
        body: {
          repo: alice,
          collection: RECORD,
          record: collection('Pública por error'),
        },
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/only in a space/)
    })
  })

  describe('privacy', () => {
    it('keeps space writes off the firehose and the public repo', async () => {
      const sentinel = `SENTINEL-${randomUUID()}`
      const sentinelRkey = `rk${randomUUID().replaceAll('-', '').slice(0, 12)}`
      const space = spaceOf(alice, `leak${sentinelRkey}`)

      const seqBefore = await network.pds.ctx.sequencer.curr()
      const commitBefore = await call('com.atproto.sync.getLatestCommit', {
        params: { did: alice },
      })

      await asOAuth(alice, fullGrant(alice), async (headers) => {
        const res = await create(headers, alice, space, sentinelRkey, {
          $type: COLLECTION,
          text: sentinel,
        })
        expect(res.status).toBe(200)
      })

      // No event at all: not a commit, not an #identity, nothing to replay.
      expect(await network.pds.ctx.sequencer.curr()).toBe(seqBefore)

      const commitAfter = await call('com.atproto.sync.getLatestCommit', {
        params: { did: alice },
      })
      expect(commitAfter.body).toEqual(commitBefore.body)

      const publicList = await call('com.atproto.repo.listRecords', {
        params: { repo: alice, collection: COLLECTION },
      })
      expect(JSON.stringify(publicList.body)).not.toContain(sentinel)

      const publicCar = await call('com.atproto.sync.getRepo', {
        params: { did: alice },
      })
      expect(publicCar.status).toBe(200)
      const carText = Buffer.from(publicCar.bytes).toString('latin1')
      expect(carText).not.toContain(sentinel)
      expect(carText).not.toContain(sentinelRkey)
    })
  })
})

describe('spaces disabled', () => {
  let network: TestNetworkNoAppView
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'spaces_disabled',
    })
    sc = network.getSeedClient()
    await basicSeed(sc)
  })

  afterAll(async () => {
    await network.close()
  })

  it('answers 501 locally instead of proxying', async () => {
    const alice = sc.dids.alice
    const url = new URL('/xrpc/com.atproto.space.createRecord', network.pds.url)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...sc.getHeaders(alice),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        space: `at://${alice}/space/${SPACE_TYPE}/self`,
        repo: alice,
        collection: COLLECTION,
        record: { $type: COLLECTION, text: 'off' },
      }),
    })
    expect(res.status).toBe(501)
    expect((await res.json()).error).toBe('MethodNotImplemented')
  })
})
