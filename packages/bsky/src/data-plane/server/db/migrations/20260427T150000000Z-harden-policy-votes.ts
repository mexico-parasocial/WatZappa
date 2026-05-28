import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Deduplicate: keep latest per (creator, subjectType, subject)
  await db
    .deleteFrom('para_policy_vote' as any)
    .where('uri' as any, 'in', (qb: any) =>
      qb
        .selectFrom('para_policy_vote')
        .select('uri')
        .where('uri', 'not in', (inner: any) =>
          inner
            .selectFrom('para_policy_vote')
            .select('uri')
            .distinctOn(['creator', 'subjectType', 'subject'])
            .orderBy('creator')
            .orderBy('subjectType')
            .orderBy('subject')
            .orderBy('createdAt', 'desc')
            .orderBy('cid', 'desc'),
        ),
    )
    .execute()

  await db.schema
    .createIndex('para_policy_vote_unique_idx')
    .on('para_policy_vote')
    .columns(['creator', 'subjectType', 'subject'])
    .unique()
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('para_policy_vote_unique_idx').execute()
}
