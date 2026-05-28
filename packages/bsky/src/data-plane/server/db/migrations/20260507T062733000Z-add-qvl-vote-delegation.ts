import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_qvld_vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('proposal', 'varchar', (col) => col.notNull())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('signal', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_qvld_vote_proposal_idx')
    .on('para_qvld_vote')
    .column('proposal')
    .execute()

  await db.schema
    .createIndex('para_qvld_vote_creator_idx')
    .on('para_qvld_vote')
    .column('creator')
    .execute()

  await db.schema
    .createTable('para_qvld_delegation')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('delegate', 'varchar', (col) => col.notNull())
    .addColumn('delegator', 'varchar', (col) => col.notNull())
    .addColumn('delegateRole', 'varchar')
    .addColumn('party', 'varchar')
    .addColumn('scopeMode', 'varchar', (col) => col.notNull())
    .addColumn('scopeCommunity', 'varchar')
    .addColumn('scopeTopic', 'varchar')
    .addColumn('scopeProposal', 'varchar')
    .addColumn('expiresAt', 'varchar')
    .addColumn('revokedAt', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_qvld_delegation_delegator_idx')
    .on('para_qvld_delegation')
    .column('delegator')
    .execute()

  await db.schema
    .createIndex('para_qvld_delegation_delegate_idx')
    .on('para_qvld_delegation')
    .column('delegate')
    .execute()

  await db.schema
    .createIndex('para_qvld_delegation_scope_community_idx')
    .on('para_qvld_delegation')
    .column('scopeCommunity')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_qvld_delegation').execute()
  await db.schema.dropTable('para_qvld_vote').execute()
}
