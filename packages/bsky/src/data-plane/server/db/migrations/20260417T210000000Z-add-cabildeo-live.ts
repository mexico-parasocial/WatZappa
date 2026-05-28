import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('cabildeo_live_session')
    .addColumn('cabildeo', 'varchar', (col) => col.notNull().primaryKey())
    .addColumn('hostDid', 'varchar', (col) => col.notNull())
    .addColumn('liveUri', 'varchar', (col) => col.notNull())
    .addColumn('startedAt', 'timestamptz', (col) => col.notNull())
    .addColumn('endedAt', 'timestamptz')
    .addColumn('createdAt', 'timestamptz', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamptz', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('cabildeo_live_session_host_idx')
    .on('cabildeo_live_session')
    .column('hostDid')
    .execute()

  await db.schema
    .createTable('cabildeo_live_presence')
    .addColumn('cabildeo', 'varchar', (col) => col.notNull())
    .addColumn('actorDid', 'varchar', (col) => col.notNull())
    .addColumn('sessionId', 'varchar', (col) => col.notNull())
    .addColumn('joinedAt', 'timestamptz', (col) => col.notNull())
    .addColumn('lastHeartbeatAt', 'timestamptz', (col) => col.notNull())
    .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
    .addPrimaryKeyConstraint('cabildeo_live_presence_pkey', [
      'cabildeo',
      'actorDid',
      'sessionId',
    ])
    .execute()

  await db.schema
    .createIndex('cabildeo_live_presence_cabildeo_expires_idx')
    .on('cabildeo_live_presence')
    .columns(['cabildeo', 'expiresAt'])
    .execute()

  await db.schema
    .createIndex('cabildeo_live_presence_actor_expires_idx')
    .on('cabildeo_live_presence')
    .columns(['actorDid', 'expiresAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cabildeo_live_presence').execute()
  await db.schema.dropTable('cabildeo_live_session').execute()
}
