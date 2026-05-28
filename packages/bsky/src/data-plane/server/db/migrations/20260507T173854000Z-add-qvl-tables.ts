import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Intensity records (QV opt-in layer)
  await db.schema
    .createTable('para_qvld_intensity')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('proposal', 'varchar', (col) => col.notNull())
    .addColumn('voter', 'varchar', (col) => col.notNull())
    .addColumn('signal', 'integer', (col) => col.notNull())
    .addColumn('units', 'integer', (col) => col.notNull())
    .addColumn('creditsSpent', 'integer', (col) => col.notNull())
    .addColumn('delegatedFrom', 'jsonb')
    .addColumn('delegationDepth', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('effectiveWeight', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_qvld_intensity_proposal_idx')
    .on('para_qvld_intensity')
    .column('proposal')
    .execute()

  await db.schema
    .createIndex('para_qvld_intensity_voter_idx')
    .on('para_qvld_intensity')
    .column('voter')
    .execute()

  // 2. Deliberation statements (Polis-style)
  await db.schema
    .createTable('para_qvld_deliberation_statement')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('proposal', 'varchar', (col) => col.notNull())
    .addColumn('body', 'varchar', (col) => col.notNull())
    .addColumn('stance', 'varchar', (col) => col.notNull())
    .addColumn('agreeCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('disagreeCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('passCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_qvld_deliberation_statement_proposal_idx')
    .on('para_qvld_deliberation_statement')
    .column('proposal')
    .execute()

  // 3. Deliberation votes (agree/disagree/pass on statements)
  await db.schema
    .createTable('para_qvld_deliberation_vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('statement', 'varchar', (col) => col.notNull())
    .addColumn('voter', 'varchar', (col) => col.notNull())
    .addColumn('vote', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_qvld_deliberation_vote_statement_idx')
    .on('para_qvld_deliberation_vote')
    .column('statement')
    .execute()

  await db.schema
    .createIndex('para_qvld_deliberation_vote_voter_idx')
    .on('para_qvld_deliberation_vote')
    .column('voter')
    .execute()

  // 4. Eigenstate snapshots (correlation matrix, shadow mode)
  await db.schema
    .createTable('para_qvld_eigenstate_snapshot')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('computedAt', 'varchar', (col) => col.notNull())
    .addColumn('eigenvalues', sql`jsonb`)
    .addColumn('correlationMatrix', sql`jsonb`)
    .addColumn('ttlSeconds', 'integer', (col) => col.notNull().defaultTo(3600))
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_qvld_eigenstate_snapshot_community_idx')
    .on('para_qvld_eigenstate_snapshot')
    .column('community')
    .execute()

  // 5. Governance config (versioned per community)
  await db.schema
    .createTable('para_qvld_governance_config')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('version', 'varchar', (col) => col.notNull())
    .addColumn('metaRules', sql`jsonb`, (col) => col.notNull())
    .addColumn('deliberationRules', sql`jsonb`)
    .addColumn('delegationRules', sql`jsonb`)
    .addColumn('countingRules', sql`jsonb`)
    .addColumn('visibilityRules', sql`jsonb`)
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_qvld_governance_config_community_idx')
    .on('para_qvld_governance_config')
    .column('community')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_qvld_governance_config').execute()
  await db.schema.dropTable('para_qvld_eigenstate_snapshot').execute()
  await db.schema.dropTable('para_qvld_deliberation_vote').execute()
  await db.schema.dropTable('para_qvld_deliberation_statement').execute()
  await db.schema.dropTable('para_qvld_intensity').execute()
}
