import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import applyWrites from './applyWrites.js'
import clearRecords from './clearRecords.js'
import createRecord from './createRecord.js'
import deleteRecord from './deleteRecord.js'
import getLatestCommit from './getLatestCommit.js'
import getRecord from './getRecord.js'
import getRepo from './getRepo.js'
import listRecords from './listRecords.js'
import listRepoOps from './listRepoOps.js'
import putRecord from './putRecord.js'

// The repo-host methods for an account's own space repos (see util.ts). Only
// registered with PDS_SPACES_ENABLED.
export default function (server: Server, ctx: AppContext) {
  applyWrites(server, ctx)
  clearRecords(server, ctx)
  createRecord(server, ctx)
  deleteRecord(server, ctx)
  getLatestCommit(server, ctx)
  getRecord(server, ctx)
  getRepo(server, ctx)
  listRecords(server, ctx)
  listRepoOps(server, ctx)
  putRecord(server, ctx)
}
