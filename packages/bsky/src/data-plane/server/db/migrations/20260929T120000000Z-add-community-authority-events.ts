import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_board')
    .addColumn('admissionMode', 'varchar', (col) =>
      col.notNull().defaultTo('open'),
    )
    .execute()

  await db.schema
    .createTable('para_community_authority_event')
    .addColumn('id', 'varchar', (col) => col.primaryKey())
    .addColumn('uri', 'varchar', (col) => col.notNull())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('action', 'varchar', (col) => col.notNull())
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('effectiveAt', 'varchar', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar')
    .addColumn('predecessor', 'varchar')
    .addColumn('version', 'integer', (col) => col.notNull())
    .addColumn('basis', 'varchar', (col) => col.notNull())
    .addColumn('evidence', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_authority_subject_idx')
    .on('para_community_authority_event')
    .columns(['communityUri', 'subject', 'version'])
    .execute()

  await db.schema
    .createIndex('para_community_authority_action_idx')
    .on('para_community_authority_event')
    .columns(['communityUri', 'action'])
    .execute()

  await sql`
    insert into para_community_authority_event (
      id, uri, cid, creator, "communityUri", subject, action, issuer,
      "effectiveAt", version, basis, evidence, "createdAt", "indexedAt"
    )
    select
      'migration:' || uri || ':member', uri, cid, creator, "communityUri",
      creator, 'member.activate', creator, "joinedAt", 1, 'migration', uri,
      "joinedAt", "indexedAt"
    from para_community_membership
    where "membershipState" = 'active'
    on conflict do nothing
  `.execute(db)

  await sql`
    insert into para_community_authority_event (
      id, uri, cid, creator, "communityUri", subject, action, issuer,
      "effectiveAt", version, basis, evidence, "createdAt", "indexedAt"
    )
    select
      'migration:' || membership.uri || ':' || role.value,
      membership.uri, membership.cid, membership.creator,
      membership."communityUri", membership.creator,
      case role.value when 'owner' then 'owner.grant' else 'moderator.grant' end,
      membership.creator, membership."joinedAt", 2, 'migration', membership.uri,
      membership."joinedAt", membership."indexedAt"
    from para_community_membership membership
    cross join lateral jsonb_array_elements_text(coalesce(membership.roles, '[]'::jsonb)) role(value)
    where membership."membershipState" = 'active'
      and role.value in ('owner', 'moderator')
    on conflict do nothing
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_authority_event').execute()
  await db.schema
    .alterTable('para_community_board')
    .dropColumn('admissionMode')
    .execute()
}
