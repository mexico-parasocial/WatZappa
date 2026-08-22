import type { AtIdentifierString, DidString } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

/**
 * Generate a personal Obsidian vault representing a user's civic footprint:
 * Communities, Authored Cabildeos, Votes, Delegations, and Highlights.
 */
export default function (server: Server, ctx: AppContext) {
  server.com.para.actor.exportCivicTree({
    auth: ctx.authVerifier.standard,
    handler: async ({ params, auth, req }) => {
      const viewer = auth.credentials.iss
      const labelers = ctx.reqLabelers(req)

      /*
       * This export aggregates the viewer's votes, delegations and highlights
       * into one document. It is only ever exportable by its subject: the
       * `actor` param exists so a client can pass its own handle, not so one
       * account can read another's. Anything else here is an account takeover
       * of the civic record.
       */
      let did = viewer
      if (params.actor) {
        const [resolved] = await ctx.hydrator.actor.getDids([
          params.actor as AtIdentifierString,
        ])
        if (!resolved) {
          throw new InvalidRequestError('Actor not found')
        }
        if (resolved !== viewer) {
          throw new InvalidRequestError(
            'A civic tree may only be exported by its owner',
            'Forbidden',
          )
        }
        did = resolved
      }

      const files: Array<{ path: string; content: string }> = []
      const generatedAt = new Date().toISOString()

      // Fetch personal civic tree data from data-plane
      const res = await ctx.dataplane.getParaPersonalCivicTree({
        actorDid: did as DidString,
        limit: 500,
        cursor: '',
      })

      const data = JSON.parse(res.itemsJson || '{}')
      const communities = data.communities || []
      const cabildeos = data.cabildeos || []
      const votes = data.votes || []
      const delegations = data.delegations || []
      const highlights = data.highlights || []

      // ── Build notes ──────────────────────────────────────────────────────────

      if (params.includeCommunities !== false) {
        for (const membership of communities) {
          const cName = membership.communityUri.split('/').pop() || 'unknown'
          files.push({
            path: `Communities/${cName}.md`,
            content: `---
atUri: "${membership.communityUri}"
membershipUri: "${membership.uri}"
type: community-membership
state: "${membership.membershipState}"
joinedAt: "${membership.joinedAt}"
exportedAt: "${generatedAt}"
---

# Community: ${cName}

- **Joined:** ${new Date(membership.joinedAt).toLocaleDateString()}
- **State:** ${membership.membershipState}
`,
          })
        }
      }

      for (const cabildeo of cabildeos) {
        files.push({
          path: `Cabildeos/${slugify(cabildeo.title)}.md`,
          content: `---
atUri: "${cabildeo.uri}"
type: cabildeo
phase: "${cabildeo.phase}"
tags: [para/cabildeo, phase/${cabildeo.phase}]
createdAt: "${cabildeo.createdAt}"
exportedAt: "${generatedAt}"
---

# ${cabildeo.title}

${cabildeo.description}
`,
        })
      }

      if (params.includeVotes !== false) {
        for (const vote of votes) {
          const rkey = vote.uri.split('/').pop()
          files.push({
            path: `Votes/${rkey}.md`,
            content: `---
atUri: "${vote.uri}"
cabildeoUri: "${vote.cabildeo}"
type: vote
option: ${vote.selectedOption ?? 'null'}
isDirect: ${vote.isDirect === 1}
createdAt: "${vote.createdAt}"
exportedAt: "${generatedAt}"
---

# Vote on \`${vote.cabildeo}\`

- **Option:** ${vote.selectedOption}
- **Direct:** ${vote.isDirect === 1 ? 'Yes' : 'No'}
- **Date:** ${new Date(vote.createdAt).toLocaleDateString()}
`,
          })
        }
      }

      if (params.includeDelegations !== false) {
        for (const del of delegations) {
          const rkey = del.uri.split('/').pop()
          files.push({
            path: `Delegations/${rkey}.md`,
            content: `---
atUri: "${del.uri}"
delegateTo: "${del.delegateTo}"
mode: "${del.mode}"
type: delegation
createdAt: "${del.createdAt}"
exportedAt: "${generatedAt}"
---

# Delegation to ${del.delegateTo}

- **Mode:** ${del.mode}
- **Scope:** ${del.community || 'Global'}
- **Date:** ${new Date(del.createdAt).toLocaleDateString()}
`,
          })
        }
      }

      if (params.includeHighlights !== false) {
        for (const hl of highlights) {
          const rkey = hl.uri.split('/').pop()
          files.push({
            path: `Highlights/${rkey}.md`,
            content: `---
atUri: "${hl.uri}"
subjectUri: "${hl.subjectUri}"
type: highlight
color: "${hl.color}"
tags: [para/highlight, compass/${hl.color}]
createdAt: "${hl.createdAt}"
exportedAt: "${generatedAt}"
---

# Highlight

> ${hl.text}

**Source:** \`${hl.subjectUri}\`
`,
          })
        }
      }

      // Vault Index
      files.push({
        path: 'README.md',
        content: `---
type: vault-index
actorDid: "${did}"
exportedAt: "${generatedAt}"
---

# Personal Civic Tree for ${did}

| Type | Count |
|---|---|
| [[Communities/]] | ${communities.length} |
| [[Cabildeos/]] | ${cabildeos.length} |
| [[Votes/]] | ${votes.length} |
| [[Delegations/]] | ${delegations.length} |
| [[Highlights/]] | ${highlights.length} |

Exported from **PARA** on ${new Date(generatedAt).toLocaleDateString()}.
`,
      })

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          generatedAt,
          files,
          summary: {
            communityCount: communities.length,
            cabildeoCount: cabildeos.length,
            voteCount: votes.length,
            delegationCount: delegations.length,
            highlightCount: highlights.length,
          },
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
