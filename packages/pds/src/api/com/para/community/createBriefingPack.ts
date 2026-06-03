import { TID } from '@atproto/common'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import type { BriefingPackView } from '../../../../lexicon/types/com/para/community/defs.js'
import { prepareCreate } from '../../../../repo/index.js'

export const BRIEFING_PACK_COLLECTION = 'com.para.community.briefingPack'

export type BriefingPackWriteRecord = {
  $type: typeof BRIEFING_PACK_COLLECTION
  packType: 'party_lobbying'
  communityUri: string
  party: string
  title: string
  summary: string
  cabildeoUris: string[]
  civicTreeCardIds: string[]
  evidenceUris: string[]
  sembleCollectionUri?: string
  marginCollectionUri?: string
  obsidianExportUri?: string
  status: 'draft' | 'published' | 'archived'
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const toBriefingPackView = ({
  uri,
  cid,
  record,
}: {
  uri: string
  cid: string
  record: BriefingPackWriteRecord
}): BriefingPackView => ({
  $type: 'com.para.community.defs#briefingPackView',
  uri,
  cid,
  packType: record.packType,
  communityUri: record.communityUri,
  party: record.party,
  title: record.title,
  summary: record.summary,
  cabildeoUris: record.cabildeoUris,
  civicTreeCardIds: record.civicTreeCardIds,
  evidenceUris: record.evidenceUris,
  sembleCollectionUri: record.sembleCollectionUri,
  marginCollectionUri: record.marginCollectionUri,
  obsidianExportUri: record.obsidianExportUri,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.createBriefingPack({
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did

      if (auth.credentials.type === 'oauth') {
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: BRIEFING_PACK_COLLECTION,
        })
      }

      const {
        packType,
        communityUri,
        party,
        title,
        summary,
        cabildeoUris,
        civicTreeCardIds,
        evidenceUris,
        sembleCollectionUri,
        marginCollectionUri,
        obsidianExportUri,
      } = input.body

      if (packType !== 'party_lobbying') {
        throw new InvalidRequestError('Unsupported briefing pack type')
      }

      const now = new Date().toISOString()
      const rkey = TID.nextStr()

      const record: BriefingPackWriteRecord = {
        $type: BRIEFING_PACK_COLLECTION,
        packType,
        communityUri,
        party,
        title,
        summary,
        cabildeoUris: cabildeoUris || [],
        civicTreeCardIds: civicTreeCardIds || [],
        evidenceUris: evidenceUris || [],
        sembleCollectionUri,
        marginCollectionUri,
        obsidianExportUri,
        status: 'draft',
        createdBy: did,
        createdAt: now,
        updatedAt: now,
      }

      const { commit, write } = await ctx.actorStore.transact(did, async (actorTxn) => {
        const write = await prepareCreate({
          did,
          collection: BRIEFING_PACK_COLLECTION,
          rkey,
          record,
        })

        const commit = await actorTxn.repo.processWrites([write])
        await ctx.sequencer.sequenceCommit(did, commit)

        return { commit, write }
      })

      if (commit) {
        await ctx.accountManager
          .updateRepoRoot(did, commit.cid, commit.rev)
          .catch(() => {})
      }

      return {
        encoding: 'application/json' as const,
        body: {
          pack: toBriefingPackView({
            uri: write.uri.toString(),
            cid: write.cid.toString(),
            record,
          }),
        },
      }
    },
  })
}
