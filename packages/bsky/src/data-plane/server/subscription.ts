import { IdResolver } from '@atproto/identity'
import { WriteOpAction } from '@atproto/repo'
import { Event as FirehoseEvent, Firehose, MemoryRunner } from '@atproto/sync'
import { DidString } from '@atproto/syntax'
import { ParaCacheService } from '../../cache/para-cache.js'
import { subLogger as log } from '../../logger.js'
import { BackgroundQueue } from './background.js'
import { Database } from './db/index.js'
import { IndexingService } from './indexing/index.js'

export class RepoSubscription {
  firehose: Firehose
  runner: MemoryRunner
  background: BackgroundQueue
  indexingSvc: IndexingService

  constructor(
    public opts: {
      service: string
      db: Database
      idResolver: IdResolver
      paraCache?: ParaCacheService
    },
  ) {
    const { service, db, idResolver, paraCache } = opts
    this.background = new BackgroundQueue(db)
    this.indexingSvc = new IndexingService(
      db,
      idResolver,
      this.background,
      paraCache,
    )

    const { runner, firehose } = createFirehose({
      idResolver,
      service,
      indexingSvc: this.indexingSvc,
    })
    this.runner = runner
    this.firehose = firehose
  }

  start() {
    this.firehose.start()
  }

  async restart() {
    await this.destroy()
    const { runner, firehose } = createFirehose({
      idResolver: this.opts.idResolver,
      service: this.opts.service,
      indexingSvc: this.indexingSvc,
    })
    this.runner = runner
    this.firehose = firehose
    this.start()
  }

  async processAll() {
    await this.runner.processAll()
    await this.background.processAll()
  }

  async destroy() {
    await this.firehose.destroy()
    await this.runner.destroy()
    await this.background.processAll()
  }
}

const createFirehose = (opts: {
  idResolver: IdResolver
  service: string
  indexingSvc: IndexingService
}) => {
  const { idResolver, service, indexingSvc } = opts
  const runner = new MemoryRunner({ startCursor: 0 })
  const firehose = new Firehose({
    idResolver,
    runner,
    service,
    unauthenticatedHandles: true, // indexing service handles these
    unauthenticatedCommits: true, // @TODO there seems to be a very rare issue where the authenticator thinks a block is missing in deletion ops
    onError: (err) => log.error({ err }, 'error in subscription'),
    handleEvent: async (evt: FirehoseEvent) => {
      const did = evt.did as DidString
      if (evt.event === 'identity') {
        await indexingSvc.indexHandle(did, evt.time, true)
      } else if (evt.event === 'account') {
        if (evt.active === false && evt.status === 'deleted') {
          await indexingSvc.deleteActor(did)
        } else {
          await indexingSvc.updateActorStatus(did, evt.active, evt.status)
        }
      } else if (evt.event === 'sync') {
        await Promise.all([
          indexingSvc.setCommitLastSeen(did, evt.cid, evt.rev),
          indexingSvc.indexHandle(did, evt.time),
        ])
      } else {
        const indexFn =
          evt.event === 'delete'
            ? indexingSvc.deleteRecord(evt.uri)
            : indexingSvc.indexRecord(
                evt.uri,
                evt.cid,
                evt.record,
                evt.event === 'create'
                  ? WriteOpAction.Create
                  : WriteOpAction.Update,
                evt.time,
              )
        await Promise.all([
          indexFn,
          indexingSvc.setCommitLastSeen(did, evt.commit, evt.rev),
          indexingSvc.indexHandle(did, evt.time),
        ])
      }
    },
  })
  return { firehose, runner }
}
