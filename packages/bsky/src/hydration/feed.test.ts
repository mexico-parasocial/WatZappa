import { expect, it, vi } from 'vitest'
import {
  asAtUriString,
  currentDatetimeString,
  lexStringify,
} from '@atproto/lex'
import type { DataPlaneClient } from '../data-plane/client/index.js'
import { app, com } from '../lexicons/index.js'
import { GetPostRecordsResponse } from '../proto/bsky_pb.js'
import { FeedHydrator } from './feed.js'

it('validates both post collections without rewriting records or their CIDs', async () => {
  const para = com.para.post.$build({
    text: 'Demo meme',
    postType: 'meme',
    createdAt: currentDatetimeString(),
  })
  const bsky = app.bsky.feed.post.$build({
    text: 'Normal post',
    createdAt: currentDatetimeString(),
  })
  const uris = [com.para.post.$type, app.bsky.feed.post.$type].map(
    (collection) =>
      asAtUriString(
        `at://did:plc:abcdefghijklmnopqrstuvwx/${collection}/3jzfcijpj2z2a`,
      ),
  )
  const response = new GetPostRecordsResponse({
    records: [para, bsky].map((record) => ({
      record: Buffer.from(lexStringify(record)),
      cid: 'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
    })),
    meta: [{}, {}],
  })
  const getPostRecords = vi.fn().mockResolvedValue(response)
  const hydrator = new FeedHydrator({
    getPostRecords,
  } as unknown as DataPlaneClient)
  const posts = await hydrator.getPosts(uris)
  expect(posts.get(uris[0])?.record).toEqual(para)
  expect(posts.get(uris[1])?.record).toEqual(bsky)
  expect(posts.get(uris[0])?.cid).toBe(response.records[0].cid)

  response.records[0].takenDown = true
  expect((await hydrator.getPosts(uris)).get(uris[0])).toBeNull()

  response.records[0].takenDown = false
  response.records[0].record = Buffer.from(lexStringify(bsky))
  expect((await hydrator.getPosts(uris)).get(uris[0])).toBeNull()
})
