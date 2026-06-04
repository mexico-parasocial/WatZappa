import { CID } from 'multiformats/cid'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { atUri } from '@atproto/lex'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { prepareUpdate } from '../../../../repo/index.js'
import {
  BRIEFING_PACK_COLLECTION,
  type BriefingPackWriteRecord,
  toBriefingPackView,
} from './createBriefingPack.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.updateBriefingPack({
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did

      if (auth.credentials.type === 'oauth') {
        auth.credentials.permissions.assertRepo({
          action: 'update',
          collection: BRIEFING_PACK_COLLECTION,
        })
      }

      const { uri: briefingPackUri, cid: swapCid, pack } = input.body
      const uri = new AtUri(briefingPackUri)
      if (uri.host !== did) {
        throw new InvalidRequestError('Cannot update briefing pack of another user')
      }

      const now = new Date().toISOString()
      const { commit, write, record } = await ctx.actorStore.transact(did, async (actorTxn) => {
        const current = await actorTxn.record.getRecord(uri, null, true)
        if (!current) {
          throw new InvalidRequestError('Briefing pack not found')
        }

        const currentRecord = current.value as BriefingPackWriteRecord
        if (currentRecord.$type !== BRIEFING_PACK_COLLECTION) {
          throw new InvalidRequestError('Briefing pack record has invalid type')
        }

        const record: BriefingPackWriteRecord = {
          ...currentRecord,
          $type: BRIEFING_PACK_COLLECTION,
          packType: 'party_lobbying',
          communityUri: currentRecord.communityUri,
          party: pack.party ?? currentRecord.party,
          title: pack.title ?? currentRecord.title,
          summary: pack.summary ?? currentRecord.summary,
          cabildeoUris: pack.cabildeoUris ?? currentRecord.cabildeoUris,
          civicTreeCardIds:
            pack.civicTreeCardIds ?? currentRecord.civicTreeCardIds,
          evidenceUris: pack.evidenceUris ?? currentRecord.evidenceUris,
          sembleCollectionUri:
            pack.sembleCollectionUri ?? currentRecord.sembleCollectionUri,
          marginCollectionUri:
            pack.marginCollectionUri ?? currentRecord.marginCollectionUri,
          obsidianExportUri:
            pack.obsidianExportUri ?? currentRecord.obsidianExportUri,
          status: pack.status ?? currentRecord.status,
          createdBy: currentRecord.createdBy,
          createdAt: currentRecord.createdAt,
          updatedAt: now,
        }

        const write = await prepareUpdate({
          did,
          collection: BRIEFING_PACK_COLLECTION,
          rkey: uri.rkey,
          record,
          swapCid: CID.parse(swapCid ?? current.cid),
        })

        const commit = await actorTxn.repo.processWrites([write])
        await ctx.sequencer.sequenceCommit(did, commit)

        return { commit, write, record }
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
