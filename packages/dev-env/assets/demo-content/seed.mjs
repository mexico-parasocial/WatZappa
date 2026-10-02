#!/usr/bin/env node
// Seeds realistic demo content for local testing, on top of the civic seed:
// image memes with threaded comments and up/down reactions, a personal civic
// tree, and two community civic trees with approved cards and relationships.
//
// It writes as the dev-env demo accounts (alice.test, bob.test, ...), which
// are the members of the dev-env community boards. Everything goes through
// the same APIs the app uses, so the backend's rules still apply: community
// cards are submitted, approved by three other members, then related.
//
// Re-running is safe: repo records use deterministic record keys, and
// collections, cards and relationships that already exist are skipped.
//
//   node ./scripts/civic-seed/demo-content.mjs [--service URL]
//     [--introspect-url URL] [--content PATH] [--images DIR] [--dry-run]
//
// Env: PARA_DEMO_PASSWORD (default: the dev-env password), PARA_DEMO_IMAGES,
//      PARA_APPVIEW_PROXY_DID.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CONTENT = path.join(HERE, 'content.json')
const DEFAULT_IMAGES = path.resolve(HERE, '../memes')
// Matches DEV_ENV_APPVIEW_DID in src/lib/constants.ts.
const DEFAULT_APPVIEW_DID = 'did:plc:6gcjjmsoeyaq4xgvkofdklqc'
// The dev-env seed's account password (WatZappa dev-env para-demo.ts).
const DEFAULT_PASSWORD = 'hunter2'

const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// ---------------------------------------------------------------------------
// XRPC plumbing

function createContext({
  service,
  appviewDid,
  password,
  dryRun,
  verbose,
  ensureSession,
}) {
  return {
    service: service.replace(/\/+$/, ''),
    proxy: `${appviewDid}#bsky_appview`,
    password,
    dryRun,
    verbose,
    sessions: new Map(),
    ensureSession,
  }
}

async function xrpc(
  ctx,
  { nsid, method = 'GET', params, body, token, proxy = false, raw },
) {
  const query = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined),
      ).toString()
    : ''
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (proxy) headers['atproto-proxy'] = ctx.proxy
  let payload
  if (raw) {
    headers['content-type'] = raw.contentType
    payload = raw.bytes
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${ctx.service}/xrpc/${nsid}${query}`, {
    method,
    headers,
    body: payload,
  })
  const text = await res.text()
  const data = text ? safeJson(text) : {}
  if (!res.ok) {
    const err = new Error(
      `${nsid} failed (${res.status}): ${data?.error || ''} ${data?.message || text}`.trim(),
    )
    err.status = res.status
    err.code = data?.error
    throw err
  }
  return data
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

async function login(ctx, handle) {
  const cached = ctx.sessions.get(handle)
  if (cached) return cached
  if (ctx.ensureSession) {
    const session = await ctx.ensureSession(handle)
    ctx.sessions.set(handle, session)
    return session
  }
  const res = await xrpc(ctx, {
    nsid: 'com.atproto.server.createSession',
    method: 'POST',
    body: { identifier: handle, password: ctx.password },
  })
  const session = { handle, did: res.did, token: res.accessJwt }
  ctx.sessions.set(handle, session)
  return session
}

function appview(ctx, session, nsid, { params, body } = {}) {
  return xrpc(ctx, {
    nsid,
    method: body === undefined ? 'GET' : 'POST',
    params,
    body,
    token: session.token,
    proxy: true,
  })
}

function putRecord(ctx, session, collection, rkey, record) {
  return xrpc(ctx, {
    nsid: 'com.atproto.repo.putRecord',
    method: 'POST',
    token: session.token,
    body: { repo: session.did, collection, rkey, record },
  })
}

// ---------------------------------------------------------------------------
// Deterministic record keys

const TID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz'

/**
 * A valid TID for `isoDate`, with a clock id derived from `key` so distinct
 * records created at the same instant still get distinct, stable rkeys.
 */
export function deterministicTid(isoDate, key) {
  const micros = BigInt(Date.parse(isoDate)) * 1000n
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  let value = (micros << 10n) | BigInt(hash % 1024)
  let out = ''
  for (let i = 0; i < 13; i++) {
    out = TID_ALPHABET[Number(value & 31n)] + out
    value >>= 5n
  }
  return out
}

// ---------------------------------------------------------------------------
// Community boards

/**
 * Resolve board names to the board the owner is an active member of. Local
 * data can hold several boards with the same name; membership picks the one
 * the demo accounts belong to.
 */
async function resolveBoards(ctx, owner, names) {
  const wanted = new Set(names)
  const resolved = new Map()
  let cursor
  do {
    const res = await appview(ctx, owner, 'com.para.community.listBoards', {
      params: { limit: 100, cursor },
    })
    for (const board of res.boards || []) {
      if (!wanted.has(board.name) || resolved.has(board.name)) continue
      try {
        const members = await appview(
          ctx,
          owner,
          'com.para.community.listMembers',
          { params: { communityId: board.communityId, limit: 100 } },
        )
        const isMember = (members.members || []).some(
          (m) =>
            m.did === owner.did &&
            (!m.membershipState || m.membershipState === 'active'),
        )
        if (isMember) resolved.set(board.name, board)
      } catch {
        // Not a member of this copy of the board.
      }
    }
    cursor = res.cursor
  } while (cursor && resolved.size < wanted.size)

  for (const name of wanted) {
    if (!resolved.has(name)) {
      throw new Error(
        `No community board named "${name}" that ${owner.handle} belongs to.`,
      )
    }
  }
  return resolved
}

async function listMembers(ctx, reader, board) {
  const members = []
  let cursor
  do {
    const page = await appview(ctx, reader, 'com.para.community.listMembers', {
      params: { communityId: board.communityId, limit: 100, cursor },
    })
    members.push(...(page.members || []))
    cursor = page.cursor
  } while (cursor)
  return members
}

async function prepareCommunities(ctx, owner, content, sync) {
  const boards = []
  let cursor
  do {
    const page = await appview(ctx, owner, 'com.para.community.listBoards', {
      params: { limit: 100, cursor },
    })
    boards.push(...(page.boards || []))
    cursor = page.cursor
  } while (cursor)
  for (const tree of content.communityTrees) {
    const candidates = boards.filter((board) => board.name === tree.community)
    let board
    for (const candidate of candidates) {
      const members = await listMembers(ctx, owner, candidate)
      if (
        members.some(
          (member) =>
            member.did === owner.did &&
            (!member.membershipState || member.membershipState === 'active'),
        )
      ) {
        board = candidate
        break
      }
    }
    board ||= candidates[0]
    if (!board) {
      const created = await xrpc(ctx, {
        nsid: 'com.para.community.createBoard',
        method: 'POST',
        token: owner.token,
        body: {
          name: tree.community,
          quadrant: 'centro',
          admissionMode: 'open',
          description: 'Comunidad de demostración del árbol cívico.',
        },
      })
      await sync()
      const { board: indexed } = await appview(
        ctx,
        owner,
        'com.para.community.getBoard',
        { params: { uri: created.uri } },
      )
      if (!indexed)
        throw new Error(`New demo community was not indexed: ${tree.community}`)
      board = indexed
      boards.push(board)
    }
    const current = new Map(
      (await listMembers(ctx, owner, board)).map((member) => [
        member.did,
        member,
      ]),
    )
    const handles = [
      ...new Set([
        owner.handle,
        ...tree.cards.map((card) => card.author),
        ...tree.relationships.map((relation) => relation.author),
      ]),
    ]
    for (const handle of handles) {
      const session = await login(ctx, handle)
      const member = current.get(session.did)
      if (member) {
        if (member.membershipState && member.membershipState !== 'active')
          throw new Error(
            `${handle} has ${member.membershipState} membership in "${tree.community}"`,
          )
        continue
      }
      const joined = await xrpc(ctx, {
        nsid: 'com.para.community.join',
        method: 'POST',
        token: session.token,
        body: { communityUri: board.uri },
      })
      if (joined.membershipState !== 'active')
        throw new Error(
          `${handle} needs membership approval for "${tree.community}"`,
        )
    }
    await sync()
  }
}

// ---------------------------------------------------------------------------
// Memes, comments and reactions

async function seedMemes(ctx, content, boards, imagesDir) {
  const refs = new Map()
  for (const meme of content.memes) {
    const author = await login(ctx, meme.author)
    const ext = path.extname(meme.image).toLowerCase()
    const contentType = IMAGE_TYPES[ext]
    if (!contentType) throw new Error(`Unsupported image type: ${meme.image}`)
    const bytes = await readFile(path.join(imagesDir, meme.image))
    const { blob } = await xrpc(ctx, {
      nsid: 'com.atproto.repo.uploadBlob',
      method: 'POST',
      token: author.token,
      raw: { bytes, contentType },
    })
    const community = meme.community
      ? boards.get(meme.community)?.communityId
      : undefined
    const rkey = deterministicTid(meme.createdAt, `meme:${meme.alias}`)
    const post = await putRecord(ctx, author, 'com.para.post', rkey, {
      $type: 'com.para.post',
      text: meme.caption,
      createdAt: meme.createdAt,
      langs: ['es'],
      postType: 'meme',
      tags: ['meme', 'demo'],
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{ image: blob, alt: meme.caption }],
      },
    })
    await putRecord(
      ctx,
      author,
      'com.para.social.postMeta',
      deterministicTid(meme.createdAt, `meme-meta:${meme.alias}`),
      {
        $type: 'com.para.social.postMeta',
        post: post.uri,
        postType: 'meme',
        category: meme.category,
        community,
        tags: ['meme', 'demo'],
        // Scores come from public reactions; metadata never awards points.
        voteScore: 0,
        createdAt: meme.createdAt,
      },
    )
    refs.set(meme.alias, { uri: post.uri, cid: post.cid, root: undefined })
    log(ctx, `meme ${meme.alias} by ${meme.author}`)
  }

  for (const comment of content.memeComments) {
    const author = await login(ctx, comment.author)
    const parent = refs.get(comment.parent)
    if (!parent) throw new Error(`Unknown comment parent: ${comment.parent}`)
    const root = parent.root || { uri: parent.uri, cid: parent.cid }
    const post = await putRecord(
      ctx,
      author,
      'com.para.post',
      deterministicTid(comment.createdAt, `comment:${comment.alias}`),
      {
        $type: 'com.para.post',
        text: comment.text,
        createdAt: comment.createdAt,
        langs: ['es'],
        reply: { root, parent: { uri: parent.uri, cid: parent.cid } },
      },
    )
    refs.set(comment.alias, { uri: post.uri, cid: post.cid, root })
  }
  log(ctx, `comments: ${content.memeComments.length}`)

  let reactions = 0
  for (const entry of content.memeReactions) {
    const meme = refs.get(entry.meme)
    const createdAt = content.memes.find(
      (m) => m.alias === entry.meme,
    ).createdAt
    const votes = [
      ...entry.up.map((handle) => [handle, 1]),
      ...entry.down.map((handle) => [handle, -1]),
    ]
    for (const [handle, value] of votes) {
      const voter = await login(ctx, handle)
      await putRecord(
        ctx,
        voter,
        'com.para.civic.openQuestionVote',
        deterministicTid(createdAt, `reaction:${handle}:${entry.meme}`),
        {
          $type: 'com.para.civic.openQuestionVote',
          subject: meme.uri,
          value,
          createdAt,
        },
      )
      reactions++
    }
  }
  log(ctx, `reactions: ${reactions}`)
  return {
    memes: content.memes.length,
    comments: content.memeComments.length,
    reactions,
  }
}

// ---------------------------------------------------------------------------
// Personal civic tree

function reference(refs, alias) {
  const ref = refs.get(alias)
  if (!ref) throw new Error(`Unknown demo source: ${alias}`)
  return ref
}

function resolveItem(item, refs) {
  const { sourceRef, highlightRef, ...resolved } = item
  if (sourceRef) {
    const source = reference(refs, sourceRef)
    resolved.sourceUri = source.uri
    if (item.kind === 'policy') {
      resolved.policyUri = source.uri
      resolved.policyCid = source.cid
      resolved.policyTitle = item.title
    }
  }
  if (highlightRef) resolved.description = reference(refs, highlightRef).text
  return resolved
}

function resolveCard(card, refs) {
  const { sourceRef, highlightRef, ...resolved } = card
  if (sourceRef) resolved.sourceUri = reference(refs, sourceRef).uri
  if (highlightRef) {
    const highlight = reference(refs, highlightRef)
    resolved.metadata = { ...card.metadata, highlightUri: highlight.uri }
    resolved.content = highlight.text
  }
  return resolved
}

export function validateContent(content) {
  const posts = new Map(content.posts.map((post) => [post.alias, post]))
  if (posts.size !== content.posts.length)
    throw new Error('Duplicate demo post alias')
  const highlights = new Set()
  for (const highlight of content.highlights) {
    const post = posts.get(highlight.subject)
    if (!post || !highlight.text || !post.text.includes(highlight.text)) {
      throw new Error(
        `Highlight "${highlight.alias}" must quote its source post`,
      )
    }
    if (highlights.has(highlight.alias) || posts.has(highlight.alias))
      throw new Error('Duplicate demo source alias')
    highlights.add(highlight.alias)
  }
  const checkSources = (entry) => {
    if (entry.sourceRef && !posts.has(entry.sourceRef))
      throw new Error(`Unknown demo source: ${entry.sourceRef}`)
    if (entry.highlightRef && !highlights.has(entry.highlightRef))
      throw new Error(`Unknown demo highlight: ${entry.highlightRef}`)
  }
  for (const collection of content.personalTree.collections) {
    const ids = new Set(collection.items.map((item) => item.itemId))
    if (ids.size !== collection.items.length)
      throw new Error(`Duplicate item in ${collection.name}`)
    collection.items.forEach(checkSources)
    for (const relation of collection.relations) {
      if (!ids.has(relation.from) || !ids.has(relation.to))
        throw new Error(`Unknown item in relation ${relation.id}`)
    }
  }
  for (const tree of content.communityTrees) {
    const keys = new Set(tree.cards.map((card) => card.key))
    if (keys.size !== tree.cards.length)
      throw new Error(`Duplicate card in ${tree.community}`)
    tree.cards.forEach(checkSources)
    for (const relation of tree.relationships) {
      if (!keys.has(relation.from) || !keys.has(relation.to))
        throw new Error(`Unknown card in ${tree.community}`)
    }
  }
}

async function seedArtifacts(ctx, content) {
  const refs = new Map()
  for (const spec of content.posts) {
    const author = await login(ctx, spec.author)
    const post = await putRecord(
      ctx,
      author,
      'com.para.post',
      deterministicTid(spec.createdAt, `tree-post:${spec.alias}`),
      {
        $type: 'com.para.post',
        text: spec.text,
        title: spec.title,
        postType: spec.postType,
        flairs: [spec.flair],
        tags: ['demo', 'civic-tree'],
        langs: ['es'],
        createdAt: spec.createdAt,
      },
    )
    await putRecord(
      ctx,
      author,
      'com.para.social.postMeta',
      deterministicTid(spec.createdAt, `tree-meta:${spec.alias}`),
      {
        $type: 'com.para.social.postMeta',
        post: post.uri,
        postType: spec.postType,
        category: spec.flair,
        flairs: [spec.flair],
        voteScore: 0,
        createdAt: spec.createdAt,
      },
    )
    refs.set(spec.alias, { ...post, text: spec.text })
  }
  for (const spec of content.highlights) {
    const author = await login(ctx, spec.author)
    const subject = reference(refs, spec.subject)
    const start = subject.text.indexOf(spec.text)
    const highlight = await putRecord(
      ctx,
      author,
      'com.para.highlight.annotation',
      deterministicTid(spec.createdAt, `tree-highlight:${spec.alias}`),
      {
        $type: 'com.para.highlight.annotation',
        subjectUri: subject.uri,
        subjectCid: subject.cid,
        text: spec.text,
        start,
        end: start + spec.text.length,
        color: spec.color,
        visibility: 'public',
        createdAt: spec.createdAt,
      },
    )
    refs.set(spec.alias, { ...highlight, text: spec.text })
  }
  return refs
}

async function seedPersonalTree(ctx, spec, refs) {
  const owner = await login(ctx, spec.owner)
  const existing = await listAllCollections(ctx, owner)
  let items = 0
  let relations = 0

  for (const collection of spec.collections) {
    let current = existing.find((c) => c.name === collection.name)
    if (!current) {
      const { id } = await appview(
        ctx,
        owner,
        'com.para.collection.createCollection',
        {
          body: {
            name: collection.name,
            description: collection.description,
            color: collection.color,
          },
        },
      )
      current = { id, items: [], relations: [] }
    }
    const haveItems = new Set((current.items || []).map((i) => i.itemId))
    const haveRelations = new Set((current.relations || []).map((r) => r.id))
    const now = new Date().toISOString()

    const newItems = collection.items
      .filter((item) => !haveItems.has(item.itemId))
      .map((item) => ({ ...resolveItem(item, refs), addedAt: now }))
    const newRelations = collection.relations
      .filter((relation) => !haveRelations.has(relation.id))
      .map((relation) => ({
        id: relation.id,
        fromItemId: relation.from,
        toItemId: relation.to,
        kind: relation.kind,
        note: relation.note,
        createdAt: now,
      }))
    items += newItems.length
    relations += newRelations.length
    const ops = [
      ...newItems.map((item) => ({ type: 'addItem', item })),
      ...newRelations.map((relation) => ({ type: 'addRelation', relation })),
    ]
    if (ops.length) {
      await writeCollectionOps(ctx, owner, current.id, {
        ops,
        newItems,
        newRelations,
      })
    }
    log(ctx, `collection "${collection.name}": +${ops.length} ops`)
  }
  return { collections: spec.collections.length, items, relations }
}

/**
 * Prefer `applyOps`; an AppView that predates it answers 501, and then the
 * whole collection is rewritten with `updateCollection` (the app's own
 * fallback in src/state/queries/collections.ts).
 */
async function writeCollectionOps(
  ctx,
  owner,
  id,
  { ops, newItems, newRelations },
) {
  try {
    await appview(ctx, owner, 'com.para.collection.applyOps', {
      body: { id, ops },
    })
    return
  } catch (err) {
    if (err.status !== 501) throw err
  }
  const { collection } = await appview(
    ctx,
    owner,
    'com.para.collection.getCollection',
    { params: { id } },
  )
  await appview(ctx, owner, 'com.para.collection.updateCollection', {
    body: {
      id,
      collection: {
        id,
        name: collection.name,
        description: collection.description,
        color: collection.color,
        items: [...(collection.items || []), ...newItems],
        relations: [...(collection.relations || []), ...newRelations],
      },
    },
  })
}

async function listAllCollections(ctx, owner) {
  const all = []
  let cursor
  do {
    const res = await appview(
      ctx,
      owner,
      'com.para.collection.listCollections',
      { params: { cursor } },
    )
    all.push(...(res.collections || []))
    cursor = res.cursor
  } while (cursor)
  return all
}

// ---------------------------------------------------------------------------
// Community civic trees

async function seedCommunityTree(ctx, tree, board, members) {
  const reader = await login(ctx, members[0])
  const graph = await appview(ctx, reader, 'com.para.community.getCivicTree', {
    params: { community: board.uri },
  })
  const cardIdByTitle = new Map(
    (graph.nodes || []).map((node) => [node.title, node.id]),
  )
  const pendingByTitle = new Map()
  let cursor
  do {
    const pending = await appview(
      ctx,
      reader,
      'com.para.community.civicTree.listContributions',
      {
        params: { community: board.uri, status: 'pending', limit: 100, cursor },
      },
    )
    for (const contribution of pending.contributions || [])
      pendingByTitle.set(contribution.title, contribution)
    cursor = pending.cursor
  } while (cursor)

  const cardIdByKey = new Map()
  let created = 0
  for (const card of tree.cards) {
    const existingId = cardIdByTitle.get(card.title)
    if (existingId) {
      cardIdByKey.set(card.key, existingId)
      continue
    }
    const author = await login(ctx, card.author)
    let contribution = pendingByTitle.get(card.title)
    if (!contribution) {
      const res = await appview(
        ctx,
        author,
        'com.para.community.civicTree.submitContribution',
        {
          body: {
            communityUri: board.uri,
            authorDid: author.did,
            title: card.title,
            content: card.content,
            sourceUri: card.sourceUri,
            sourceUrl: card.sourceUrl,
            sourceType: card.sourceType,
            metadata: card.metadata ? JSON.stringify(card.metadata) : undefined,
          },
        },
      )
      contribution = res.contribution
    }

    // Approve with other members until the backend turns it into a card.
    const approvers = members.filter((handle) => handle !== card.author)
    for (const handle of approvers) {
      if (contribution.status === 'approved') break
      const voter = await login(ctx, handle)
      try {
        const res = await appview(
          ctx,
          voter,
          'com.para.community.civicTree.voteContribution',
          {
            body: {
              contribution: contribution.id,
              voterDid: voter.did,
              vote: 'approve',
            },
          },
        )
        contribution = res.contribution
      } catch (err) {
        throw new Error(
          `Approval by ${handle} for "${card.title}" failed: ${err.message}`,
        )
      }
    }
    if (contribution.status !== 'approved' || !contribution.approved_card_id) {
      throw new Error(
        `Contribution "${card.title}" was not approved (status ${contribution.status}).`,
      )
    }
    cardIdByKey.set(card.key, contribution.approved_card_id)
    created++
  }

  const haveEdges = new Set(
    (graph.edges || []).map(
      (e) => `${e.source}|${e.target}|${e.relationship_type}`,
    ),
  )
  let related = 0
  for (const rel of tree.relationships) {
    const source = cardIdByKey.get(rel.from)
    const target = cardIdByKey.get(rel.to)
    if (!source || !target) {
      throw new Error(
        `Relationship references unknown card: ${rel.from} → ${rel.to}`,
      )
    }
    if (haveEdges.has(`${source}|${target}|${rel.type}`)) continue
    const author = await login(ctx, rel.author)
    await appview(
      ctx,
      author,
      'com.para.community.civicTree.createRelationship',
      {
        body: {
          communityUri: board.uri,
          sourceCardId: source,
          targetCardId: target,
          relationshipType: rel.type,
          authorDid: author.did,
        },
      },
    )
    related++
  }
  log(
    ctx,
    `community "${tree.community}": +${created} cards, +${related} relationships`,
  )
  return { cards: created, relationships: related }
}

// ---------------------------------------------------------------------------
// Entry points

function log(ctx, message) {
  if (ctx.verbose) console.log(`  ${message}`)
}

async function appviewDidFromIntrospection(url) {
  try {
    const res = await fetch(url)
    const data = await res.json()
    return data?.bsky?.did
  } catch {
    return undefined
  }
}

export async function seedDemoContent({
  service = 'http://localhost:2583',
  introspectUrl,
  appviewDid,
  includeMemes = true,
  ensureCommunities = false,
  ensureSession,
  sync = async () => {},
  contentPath = DEFAULT_CONTENT,
  imagesDir = process.env.PARA_DEMO_IMAGES || DEFAULT_IMAGES,
  password = process.env.PARA_DEMO_PASSWORD || DEFAULT_PASSWORD,
  dryRun = false,
  verbose = false,
} = {}) {
  const content = JSON.parse(await readFile(contentPath, 'utf8'))
  content.posts ||= []
  content.highlights ||= []
  validateContent(content)
  const communityNames = [
    ...new Set([
      ...(includeMemes
        ? content.memes.map((m) => m.community).filter(Boolean)
        : []),
      ...content.communityTrees.map((t) => t.community),
    ]),
  ]

  console.log('Demo content:')
  console.log(
    `  planned: ${includeMemes ? content.memes.length : 0} memes, ${includeMemes ? content.memeComments.length : 0} comments, ` +
      `${includeMemes ? content.memeReactions.reduce((n, r) => n + r.up.length + r.down.length, 0) : 0} reactions, ` +
      `${content.personalTree.collections.length} collections for ${content.personalTree.owner}, ` +
      `${content.communityTrees.length} community trees, ${content.posts.length} source posts, ${content.highlights.length} highlights`,
  )
  if (dryRun) {
    console.log('  dry-run: nothing written')
    return
  }

  appviewDid =
    appviewDid ||
    process.env.PARA_APPVIEW_PROXY_DID ||
    (introspectUrl && (await appviewDidFromIntrospection(introspectUrl))) ||
    DEFAULT_APPVIEW_DID
  const ctx = createContext({
    service,
    appviewDid,
    password,
    dryRun,
    verbose,
    ensureSession,
  })
  const owner = await login(ctx, content.personalTree.owner)
  if (ensureCommunities) {
    await prepareCommunities(ctx, owner, content, sync)
  }
  const boards = await resolveBoards(ctx, owner, communityNames)

  if (includeMemes) {
    const memes = await seedMemes(ctx, content, boards, imagesDir)
    console.log(
      `  memes: ${memes.memes}, comments: ${memes.comments}, reactions: ${memes.reactions}`,
    )
  }
  const refs = await seedArtifacts(ctx, content)
  await sync()
  console.log(
    `  tree sources: ${content.posts.length} posts, ${content.highlights.length} highlights`,
  )

  const tree = await seedPersonalTree(ctx, content.personalTree, refs)
  console.log(
    `  personal tree (${content.personalTree.owner}): ${tree.collections} collections, +${tree.items} items, +${tree.relations} relations`,
  )

  for (const treeSpec of content.communityTrees) {
    const board = boards.get(treeSpec.community)
    const memberDids = new Set()
    let cursor
    do {
      const page = await appview(ctx, owner, 'com.para.community.listMembers', {
        params: { communityId: board.communityId, limit: 100, cursor },
      })
      for (const member of page.members || []) {
        if (!member.membershipState || member.membershipState === 'active')
          memberDids.add(member.did)
      }
      cursor = page.cursor
    } while (cursor)
    const handles = [
      ...new Set([
        owner.handle,
        ...treeSpec.cards.map((c) => c.author),
        ...treeSpec.relationships.map((r) => r.author),
      ]),
    ]
    const members = []
    for (const handle of handles) {
      const session = await login(ctx, handle)
      if (memberDids.has(session.did)) members.push(handle)
    }
    for (const handle of handles) {
      if (!members.includes(handle))
        throw new Error(
          `${handle} must be an active member of "${treeSpec.community}"`,
        )
    }
    if (members.length < 4)
      throw new Error(
        `"${treeSpec.community}" needs at least four active demo members`,
      )
    const resolvedTree = {
      ...treeSpec,
      cards: treeSpec.cards.map((card) => resolveCard(card, refs)),
    }
    const result = await seedCommunityTree(ctx, resolvedTree, board, members)
    console.log(
      `  community tree "${treeSpec.community}": +${result.cards} cards, +${result.relationships} relationships`,
    )
  }
  await sync()
}

export function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (!v) throw new Error(`${arg} needs a value`)
      return v
    }
    if (arg === '--service') options.service = value()
    else if (arg === '--introspect-url') options.introspectUrl = value()
    else if (arg === '--content') options.contentPath = path.resolve(value())
    else if (arg === '--images') options.imagesDir = path.resolve(value())
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--verbose') options.verbose = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}
