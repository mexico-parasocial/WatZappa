import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

/**
 * Generate an Obsidian vault from a community briefing pack, a full
 * community's civic tree, or a user's personal civic tree.
 *
 * Each file returned has:
 *  - path:    e.g. "BriefingPacks/Rent Stabilization - Party A.md"
 *  - content: Markdown with YAML frontmatter (atUri, cid, tags, compass)
 *             and Obsidian [[wikilinks]] for cross-references
 */
export default function (server: Server, ctx: AppContext) {
  server.com.para.community.exportObsidianVault({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      if (!params.community && !params.briefingPack) {
        throw new InvalidRequestError(
          'Either community or briefingPack param is required',
        )
      }

      const files: Array<{ path: string; content: string }> = []
      const generatedAt = new Date().toISOString()

      // ── Community scoped export ───────────────────────────────────────────
      if (params.community) {
        const communityUri = params.community

        // Community board info
        const boardRes = await ctx.dataplane.getParaCommunityBoard({
          communityId: communityUri,
          uri: communityUri,
          viewerDid: viewer ?? '',
        })
        const board = boardRes.board

        // Fetch community posts (evidence & positions)
        const postsRes = await ctx.dataplane.getParaCommunityPosts({
          community: communityUri,
          limit: 100,
          cursor: '',
        })

        // Fetch briefing packs for the community
        const packsRes = await ctx.dataplane.getParaCommunityBriefingPacks({
          communityUri,
          viewerDid: viewer ?? '',
          limit: 50,
          cursor: '',
          query: '',
          status: '',
        })

        // Index file
        files.push({
          path: `Communities/${slugify(board?.name ?? communityUri)}.md`,
          content: buildCommunityIndexNote(board, communityUri),
        })

        // One note per briefing pack
        for (const pack of packsRes.briefingPacks) {
          files.push({
            path: `BriefingPacks/${slugify(pack.title)}.md`,
            content: buildBriefingPackNote(pack, board?.name),
          })
        }

        // Recent posts as evidence/position notes
        for (const post of postsRes.items.slice(0, 30)) {
          files.push({
            path: `Posts/${post.uri.split('/').pop()}.md`,
            content: buildPostNote(post, board?.name),
          })
        }

        // Map/index note
        files.push({
          path: 'README.md',
          content: buildVaultReadme(board?.name ?? communityUri, packsRes.briefingPacks.length, postsRes.items.length),
        })
      }

      // ── Briefing pack only export ─────────────────────────────────────────
      if (params.briefingPack) {
        const packRes = await ctx.dataplane.getParaCommunityBriefingPack({
          uri: params.briefingPack,
          viewerDid: viewer ?? '',
        })

        if (!packRes.briefingPack) {
          throw new InvalidRequestError('Briefing pack not found', 'NotFound')
        }

        const pack = packRes.briefingPack

        // Main briefing pack note
        files.push({
          path: `BriefingPacks/${slugify(pack.title)}.md`,
          content: buildBriefingPackNote(pack, undefined),
        })

        // README / table of contents
        files.push({
          path: 'README.md',
          content: buildPackReadme(pack),
        })

        // One placeholder note per linked cabildeo URI
        // (cabildeoUris are stored in DB as jsonb, not yet returned in proto —
        //  we record them as stubs with AT URIs for Obsidian link resolution)
        files.push({
          path: 'Evidence/.gitkeep',
          content: `---\nnote: Evidence files go here. Import via PARA app.\n---\n`,
        })
      }

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: { generatedAt, files },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

// ── Note builders ────────────────────────────────────────────────────────────

function buildCommunityIndexNote(board: any, communityUri: string): string {
  const name = board?.name ?? communityUri
  const quadrant = board?.quadrant ?? ''
  const description = parseString(board?.description) ?? ''

  return `---
atUri: "${communityUri}"
type: community
quadrant: "${quadrant}"
tags: [para/community, ${quadrant ? `compass/${quadrant}` : 'compass/unknown'}]
exportedAt: "${new Date().toISOString()}"
---

# ${name}

${description}

## Active Briefing Packs

See [[BriefingPacks/]] folder.

## Recent Posts

See [[Posts/]] folder.

## Links

- PARA: [Open in app](para://community/${encodeURIComponent(communityUri)})
- AT URI: \`${communityUri}\`
`
}

type PackProto = {
  uri: string
  cid: string
  communityUri: string
  title: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  createdByHandle: string
}

function buildBriefingPackNote(pack: PackProto, communityName?: string): string {
  const compassTag = '' // would come from community quadrant
  const communityLink = communityName
    ? `[[Communities/${slugify(communityName)}]]`
    : `\`${pack.communityUri}\``

  return `---
atUri: "${pack.uri}"
cid: "${pack.cid}"
type: briefing-pack
status: "${pack.status}"
communityUri: "${pack.communityUri}"
createdBy: "${pack.createdBy}"
tags: [para/briefing-pack, status/${pack.status}]
createdAt: "${pack.createdAt}"
updatedAt: "${pack.updatedAt}"
exportedAt: "${new Date().toISOString()}"
---

# ${pack.title}

> **Community:** ${communityLink}
> **Status:** ${pack.status}
> **Created by:** ${pack.createdByHandle || pack.createdBy}
> **Updated:** ${formatDate(pack.updatedAt)}

## Summary

${pack.description || '_No summary provided._'}

## Linked Cabildeos

_Import full cabildeo details by re-exporting with \`?briefingPack=${pack.uri}\`_

## Evidence

_Evidence links attached to this pack appear here after hydration._

## Amendment History

_No amendments recorded yet._

---

*Exported from [PARA](https://para.mx) on ${formatDate(new Date().toISOString())}*
*AT URI: \`${pack.uri}\`*
`
}

function buildPostNote(post: any, communityName?: string): string {
  const rkey = post.uri?.split('/').pop() ?? 'unknown'
  return `---
atUri: "${post.uri}"
cid: "${post.cid}"
type: post
author: "${post.author}"
tags: [para/post]
createdAt: "${post.createdAt}"
exportedAt: "${new Date().toISOString()}"
---

# Post ${rkey}

${post.text ?? ''}

---

- **Author:** \`${post.author}\`
- **Community:** ${communityName ? `[[Communities/${slugify(communityName)}]]` : '_unknown_'}
- **AT URI:** \`${post.uri}\`
`
}

function buildVaultReadme(communityName: string, packCount: number, postCount: number): string {
  return `---
type: vault-index
exportedAt: "${new Date().toISOString()}"
---

# ${communityName} — Civic Vault

Exported from **PARA** on ${formatDate(new Date().toISOString())}.

## Contents

| Section | Count |
|---------|-------|
| [[Communities/]] | 1 community |
| [[BriefingPacks/]] | ${packCount} packs |
| [[Posts/]] | ${postCount} posts |

## How to use this vault

1. Open this folder in [Obsidian](https://obsidian.md)
2. Enable **Graph View** to see connections between cabildeos, evidence, and packs
3. AT URIs in frontmatter link every note back to its live PARA record
4. Re-export from PARA to refresh

> **Note:** This vault is read-only. To edit or publish, use the PARA app.
`
}

function buildPackReadme(pack: PackProto): string {
  return `---
type: vault-index
exportedAt: "${new Date().toISOString()}"
---

# Briefing Pack: ${pack.title}

Exported from **PARA** on ${formatDate(new Date().toISOString())}.

## Files

- [[BriefingPacks/${slugify(pack.title)}]] — Main briefing document
- [[Evidence/]] — Attached evidence (import separately)

## AT URI

\`${pack.uri}\`

Re-export from PARA to refresh this vault.
`
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Convert a title to a safe filename slug */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}
