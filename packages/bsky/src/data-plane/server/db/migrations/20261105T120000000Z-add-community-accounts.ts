import type { Kysely } from 'kysely'

/*
 * OD-9 community accounts. A community is a repo whose
 * `com.para.community.event` chain the AppView folds in `seq` order with the
 * shared policy. `para_community_chain_event` keeps every event with its
 * request proof, so the state tables can be rebuilt from it alone, with no
 * network and in any arrival order.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_account')
    .addColumn('did', 'varchar', (col) => col.primaryKey())
    .addColumn('lastSeq', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('lastCid', 'varchar')
    .addColumn('governanceMode', 'varchar')
    .addColumn('admissionMode', 'varchar')
    .addColumn('broken', 'varchar')
    .addColumn('name', 'varchar')
    .addColumn('description', 'varchar')
    .addColumn('quadrant', 'varchar')
    .addColumn('region', 'varchar')
    .addColumn('profileCid', 'varchar')
    .addColumn('createdAt', 'varchar')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('para_community_chain_event')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('prev', 'varchar')
    .addColumn('action', 'varchar', (col) => col.notNull())
    .addColumn('actor', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('offer', 'integer')
    .addColumn('expiresAt', 'varchar')
    .addColumn('governanceMode', 'varchar')
    .addColumn('admissionMode', 'varchar')
    .addColumn('requestUri', 'varchar', (col) => col.notNull())
    .addColumn('requestCid', 'varchar', (col) => col.notNull())
    .addColumn('requestProof', 'bytea', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('pending'))
    .addColumn('reason', 'varchar')
    // Set when the record is deleted or rewritten. Survives a rebuild.
    .addColumn('tampered', 'varchar')
    .execute()
  await db.schema
    .createIndex('para_community_chain_event_seq_idx')
    .on('para_community_chain_event')
    .columns(['community', 'seq'])
    .execute()

  await db.schema
    .createTable('para_community_member_state')
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('did', 'varchar', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('offices', 'jsonb', (col) => col.notNull())
    .addColumn('suspendedUntil', 'varchar')
    .addColumn('since', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_member_state_pkey', [
      'community',
      'did',
    ])
    .execute()
  await db.schema
    .createIndex('para_community_member_state_did_idx')
    .on('para_community_member_state')
    .column('did')
    .execute()

  await db.schema
    .createTable('para_community_open_offer')
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('office', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_open_offer_pkey', [
      'community',
      'seq',
    ])
    .execute()

  // A request backs at most one event, across every community.
  await db.schema
    .createTable('para_community_used_request')
    .addColumn('requestUri', 'varchar', (col) => col.primaryKey())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_used_request').execute()
  await db.schema.dropTable('para_community_open_offer').execute()
  await db.schema.dropTable('para_community_member_state').execute()
  await db.schema.dropTable('para_community_chain_event').execute()
  await db.schema.dropTable('para_community_account').execute()
}
