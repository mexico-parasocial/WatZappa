import type { Kysely } from 'kysely'
import type { DatabaseSchemaType } from '../data-plane/server/db/database-schema.js'
import {
  type ParaGovernanceDB,
  materializeGovernanceMembers,
} from './governance.js'
import { ParaPolicyOutbox } from './outbox.js'
import type {
  ParaPolicyPublisher,
  ParaPolicyRecoveryChallenge,
  PreparedParaPolicyUpdate,
} from './publisher.js'

/** One configured board and space. Called within the indexer's transaction. */
export class ParaPolicyPublicationService {
  readonly boardUri: string

  constructor(private readonly publisher: ParaPolicyPublisher) {
    this.boardUri = publisher.getBindings().sourceUri
  }

  async publish(
    db: Kysely<DatabaseSchemaType>,
    eventId: string,
  ): Promise<PreparedParaPolicyUpdate> {
    if (!db.isTransaction)
      throw new Error('Policy publication requires index transaction')
    const sourceCid = await this.boardCid(db)
    const members = await materializeGovernanceMembers(
      db.$pickTables<keyof ParaGovernanceDB>(),
      this.boardUri,
    )
    return new ParaPolicyOutbox(
      db.$pickTables<'para_policy_publication' | 'para_policy_outbox'>(),
      this.publisher,
    ).enqueue(eventId, { kind: 'snapshot', sourceCid, members })
  }

  async prepareCheckpoint(
    db: Kysely<DatabaseSchemaType>,
    eventId: string,
    challenge: ParaPolicyRecoveryChallenge,
  ): Promise<PreparedParaPolicyUpdate> {
    if (!db.isTransaction)
      throw new Error('Policy checkpoint requires index transaction')
    const sourceCid = await this.boardCid(db)
    const members = await materializeGovernanceMembers(
      db.$pickTables<keyof ParaGovernanceDB>(),
      this.boardUri,
    )
    return new ParaPolicyOutbox(
      db.$pickTables<'para_policy_publication' | 'para_policy_outbox'>(),
      this.publisher,
    ).prepareCheckpoint(eventId, challenge, {
      kind: 'snapshot',
      sourceCid,
      members,
    })
  }

  private async boardCid(db: Kysely<DatabaseSchemaType>): Promise<string> {
    const board = await db
      .selectFrom('para_community_board')
      .select(['cid', 'creator'])
      .where('uri', '=', this.boardUri)
      .executeTakeFirst()
    if (!board) throw new Error('Policy board is not indexed')
    return board.cid
  }
}
