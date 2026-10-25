import { TID } from '@atproto/common'
import { parseCid } from '@atproto/lex-data'
import { AtUri, type AtUriString, type DidString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { prepareCreate, prepareUpdate } from '../../../../repo/index.js'
import { commitWrites, stripUndefined, updateRepoRoot } from '../util.js'

export const BRIEFING_PACK_COLLECTION = 'com.para.community.briefingPack'

type BriefingPackRecord = {
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
  status: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

const toBriefingPackView = ({
  uri,
  cid,
  record,
}: {
  uri: string
  cid: string
  record: BriefingPackRecord
}) =>
  ({
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
  }) as com.para.community.defs.BriefingPackView

export function createBriefingPack(server: Server, ctx: AppContext) {
  server.add(com.para.community.createBriefingPack, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'create',
          collection: BRIEFING_PACK_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const { body } = input

      if (body.packType !== 'party_lobbying') {
        throw new InvalidRequestError('Unsupported briefing pack type')
      }

      const now = new Date().toISOString()
      const record: BriefingPackRecord = {
        $type: BRIEFING_PACK_COLLECTION,
        packType: body.packType,
        communityUri: body.communityUri,
        party: body.party,
        title: body.title,
        summary: body.summary,
        cabildeoUris: body.cabildeoUris || [],
        civicTreeCardIds: body.civicTreeCardIds || [],
        evidenceUris: body.evidenceUris || [],
        sembleCollectionUri: body.sembleCollectionUri,
        marginCollectionUri: body.marginCollectionUri,
        obsidianExportUri: body.obsidianExportUri,
        status: 'draft',
        createdBy: did,
        createdAt: now,
        updatedAt: now,
      }

      const { commit, write } = await ctx.actorStore.transact(
        did,
        async (actorTxn) => {
          const write = await prepareCreate({
            did,
            collection: BRIEFING_PACK_COLLECTION,
            rkey: TID.nextStr(),
            record: stripUndefined(record),
          })
          const commit = await commitWrites(ctx, actorTxn, did, [write])
          return { commit, write }
        },
      )

      await updateRepoRoot(ctx, did, commit, 'createBriefingPack')

      return {
        encoding: 'application/json',
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

export function updateBriefingPack(server: Server, ctx: AppContext) {
  server.add(com.para.community.updateBriefingPack, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'update',
          collection: BRIEFING_PACK_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const did: DidString = auth.credentials.did
      const { uri: briefingPackUri, cid: swapCid, pack } = input.body
      const uri = new AtUri(briefingPackUri)
      if (uri.host !== did || uri.collection !== BRIEFING_PACK_COLLECTION) {
        throw new InvalidRequestError(
          'Cannot update briefing pack of another user',
        )
      }

      const now = new Date().toISOString()
      const { commit, write, record } = await ctx.actorStore.transact(
        did,
        async (actorTxn) => {
          const current = await actorTxn.record.getRecord(uri, null, true)
          if (!current) {
            throw new InvalidRequestError('Briefing pack not found')
          }

          const currentRecord = current.value as BriefingPackRecord
          if (currentRecord.$type !== BRIEFING_PACK_COLLECTION) {
            throw new InvalidRequestError(
              'Briefing pack record has invalid type',
            )
          }

          const record: BriefingPackRecord = {
            ...currentRecord,
            $type: BRIEFING_PACK_COLLECTION,
            packType: 'party_lobbying',
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
            updatedAt: now,
          }

          const write = await prepareUpdate({
            did,
            collection: BRIEFING_PACK_COLLECTION,
            rkey: uri.rkey,
            record: stripUndefined(record),
            swapCid: parseCid(swapCid ?? current.cid),
          })
          const commit = await commitWrites(ctx, actorTxn, did, [write])
          return { commit, write, record }
        },
      )

      await updateRepoRoot(ctx, did, commit, 'updateBriefingPack')

      return {
        encoding: 'application/json',
        body: {
          pack: toBriefingPackView({
            uri: write.uri.toString() as AtUriString,
            cid: write.cid.toString(),
            record,
          }),
        },
      }
    },
  })
}
