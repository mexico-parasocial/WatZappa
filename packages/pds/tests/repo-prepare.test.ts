import { CID } from 'multiformats/cid'
import { BlobRef } from '@atproto/lexicon'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import { ids } from '../src/lexicon/lexicons.js'
import { PreparedDelete, prepareCreate, writeToOp } from '../src/repo/index.js'

describe('repo/prepare', () => {
  const did = 'did:plc:alice'
  const createdAt = new Date(0).toISOString()

  it('forces the self rkey for com.para.status', async () => {
    const prepared = await prepareCreate({
      did,
      collection: ids.ComParaStatus,
      record: {
        status: 'Available for committee work',
        createdAt,
      },
      validate: true,
    })

    expect(prepared.uri.rkey).toBe('self')
  })

  it('derives com.para.social.postMeta rkey from the referenced post', async () => {
    const postRkey = '2222222222222'
    const prepared = await prepareCreate({
      did,
      collection: ids.ComParaSocialPostMeta,
      record: {
        post: AtUri.make(did, ids.ComParaPost, postRkey).toString(),
        postType: 'policy',
        voteScore: 0,
        createdAt,
      },
      validate: true,
    })

    expect(prepared.uri.rkey).toBe(postRkey)
  })

  it('rejects com.para.social.postMeta records that point at another repo', async () => {
    const attempt = prepareCreate({
      did,
      collection: ids.ComParaSocialPostMeta,
      record: {
        post: AtUri.make(
          'did:plc:bob',
          ids.ComParaPost,
          '2222222222222',
        ).toString(),
        postType: 'policy',
        voteScore: 0,
        createdAt,
      },
      validate: true,
    })

    await expect(attempt).rejects.toThrow('same repo')
  })

  it('rejects mismatched record $type values', async () => {
    const attempt = prepareCreate({
      did,
      collection: ids.ComParaPost,
      record: {
        $type: ids.ComParaStatus,
        status: 'Wrong shape',
        createdAt,
      },
      validate: true,
    })

    await expect(attempt).rejects.toThrow(
      `Invalid $type: expected ${ids.ComParaPost}, got ${ids.ComParaStatus}`,
    )
  })

  it('rejects invalid record keys through the schema registry', async () => {
    const attempt = prepareCreate({
      did,
      collection: ids.AppBskyActorProfile,
      rkey: 'not-self',
      record: {
        displayName: 'Alice',
      },
      validate: true,
    })

    await expect(attempt).rejects.toThrow(
      `Invalid record key for ${ids.AppBskyActorProfile}`,
    )
  })

  it('rejects legacy blob refs even when validation is disabled', async () => {
    const legacyBlob = BlobRef.fromJsonRef({
      cid: 'bafkreigh2akiscaildc5u7r3xj3s6g3g7u6z3d3m4r7dij6d4ncz7r5zvq',
      mimeType: 'image/jpeg',
    })

    const attempt = prepareCreate({
      did,
      collection: 'com.example.record',
      record: {
        $type: 'com.example.record',
        image: legacyBlob,
      },
      validate: false,
    })

    await expect(attempt).rejects.toThrow(`Legacy blob ref at 'image'`)
  })

  it('normalizes typed lexicon blob refs before schema validation', async () => {
    const cid = CID.parse(
      'bafkreigh2akiscaildc5u7r3xj3s6g3g7u6z3d3m4r7dij6d4ncz7r5zvq',
    )
    const typedBlob = BlobRef.fromJsonRef({
      $type: 'blob',
      ref: cid,
      mimeType: 'image/jpeg',
      size: 123,
    })

    const prepared = await prepareCreate({
      did,
      collection: ids.AppBskyFeedPost,
      record: {
        text: 'hello world',
        createdAt,
        embed: {
          $type: 'app.bsky.embed.images',
          images: [{ image: typedBlob, alt: 'A civic chart' }],
        },
      },
      validate: true,
    })

    expect(prepared.record).toMatchObject({
      embed: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: {
              $type: 'blob',
              ref: cid,
              mimeType: 'image/jpeg',
              size: 123,
            },
          },
        ],
      },
    })
    expect(prepared.blobs).toHaveLength(1)
    expect(prepared.blobs[0].cid.toString()).toBe(cid.toString())
  })

  it('revives xrpc-style blob json before schema validation', async () => {
    const cid = 'bafkreigh2akiscaildc5u7r3xj3s6g3g7u6z3d3m4r7dij6d4ncz7r5zvq'

    const prepared = await prepareCreate({
      did,
      collection: ids.AppBskyFeedPost,
      record: {
        text: 'json blob bridge',
        createdAt,
        embed: {
          $type: 'app.bsky.embed.images',
          images: [
            {
              image: {
                $type: 'blob',
                ref: { $link: cid },
                mimeType: 'image/jpeg',
                size: 123,
              },
              alt: 'Serialized image',
            },
          ],
        },
      },
      validate: true,
    })

    expect(prepared.blobs).toHaveLength(1)
    expect(prepared.blobs[0].cid.toString()).toBe(cid)
  })

  it('uses safe uri accessors when converting writes to ops', () => {
    const badWrite: PreparedDelete = {
      action: WriteOpAction.Delete,
      uri: new AtUri('at://did:plc:alice/not-a-nsid/valid'),
      swapCid: null,
    }

    expect(() => writeToOp(badWrite)).toThrow()
  })

  it('accepts com.para.community.board records as first-class repo records', async () => {
    const prepared = await prepareCreate({
      did,
      collection: ids.ComParaCommunityBoard,
      record: {
        name: 'Monterrey Centro',
        quadrant: 'noreste-05',
        delegatesChatId: 'delegates-chat',
        subdelegatesChatId: 'subdelegates-chat',
        createdAt,
      },
      validate: true,
    })

    expect(prepared.record.$type).toBe(ids.ComParaCommunityBoard)
  })

  it('accepts com.para.community.governance records as first-class repo records', async () => {
    const prepared = await prepareCreate({
      did,
      collection: ids.ComParaCommunityGovernance,
      rkey: 'monterrey-centro',
      record: {
        community: 'Monterrey Centro',
        slug: 'monterrey-centro',
        createdAt,
        updatedAt: createdAt,
        moderators: [
          {
            did,
            role: 'Moderator',
            badge: 'Moderator',
            capabilities: ['publish_governance_updates'],
          },
        ],
        officials: [],
        deputies: [],
      },
      validate: true,
    })

    expect(prepared.record.$type).toBe(ids.ComParaCommunityGovernance)
    expect(prepared.uri.rkey).toBe('monterrey-centro')
  })
})
