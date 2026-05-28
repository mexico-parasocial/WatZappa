import { Kysely } from 'kysely'

/**
 * Adds missing production indexes identified by code audit of hot queries
 * in data-plane routes. These indexes target full-table scans on the
 * most frequently accessed tables.
 *
 * Hot queries addressed:
 *   - getParaAuthorFeed:    para_post WHERE creator = ? ORDER BY sortAt
 *   - getParaThread:        para_post WHERE replyRoot = ? OR replyParent = ?
 *   - getActorCollections:  collection WHERE creator = ? ORDER BY updatedAt
 *   - getParaCabildeoPositions: cabildeo_position WHERE cabildeo = ? AND stance = ? ORDER BY sortAt
 *   - getActiveLiveSession: cabildeo_live_session WHERE cabildeo = ?
 *   - putParaCabildeoLivePresence: cabildeo_live_presence WHERE cabildeo = ? AND actorDid = ?
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  // ==========================================================================
  // para_post — Civic feed posts
  // ==========================================================================

  // getParaAuthorFeed filters by creator and paginates by sortAt.
  // Existing separate indexes (creator) and (sortAt) can be combined by
  // bitmap scan, but a composite index is more efficient for this hot path.
  await db.schema
    .createIndex('para_post_creator_sortat_idx')
    .on('para_post')
    .columns(['creator', 'sortAt'])
    .execute()

  // getParaThread queries replies by replyRoot or replyParent.
  // Without these, every thread load scans the entire para_post table.
  await db.schema
    .createIndex('para_post_replyroot_idx')
    .on('para_post')
    .column('replyRoot')
    .execute()

  await db.schema
    .createIndex('para_post_replyparent_idx')
    .on('para_post')
    .column('replyParent')
    .execute()

  // ==========================================================================
  // collection — Civic Map branches (added 2026-05-07)
  // ==========================================================================

  // getActorCollections filters by creator and orders by updatedAt DESC.
  // The primary key is (creator, key) which helps lookups, but pagination
  // by updatedAt needs its own ordering index.
  await db.schema
    .createIndex('collection_creator_updatedat_idx')
    .on('collection')
    .columns(['creator', 'updatedAt'])
    .execute()

  // ==========================================================================
  // cabildeo_position — Deliberation positions
  // ==========================================================================

  // getParaCabildeoPositions filters by cabildeo and stance, orders by sortAt.
  // Existing cabildeo_position_cabildeo_idx covers cabildeo-only filters,
  // but the stance filter causes a residual predicate scan.
  await db.schema
    .createIndex('cabildeo_position_cabildeo_stance_sortat_idx')
    .on('cabildeo_position')
    .columns(['cabildeo', 'stance', 'sortAt'])
    .execute()

  // ==========================================================================
  // cabildeo_live_session / cabildeo_live_presence — Live deliberation
  // ==========================================================================

  // getActiveLiveSession: WHERE cabildeo = ? AND endedAt IS NULL
  await db.schema
    .createIndex('cabildeo_live_session_cabildeo_idx')
    .on('cabildeo_live_session')
    .column('cabildeo')
    .execute()

  // putParaCabildeoLivePresence: WHERE cabildeo = ? AND actorDid = ?
  await db.schema
    .createIndex('cabildeo_live_presence_cabildeo_actordid_idx')
    .on('cabildeo_live_presence')
    .columns(['cabildeo', 'actorDid'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex('cabildeo_live_presence_cabildeo_actordid_idx')
    .execute()

  await db.schema.dropIndex('cabildeo_live_session_cabildeo_idx').execute()

  await db.schema
    .dropIndex('cabildeo_position_cabildeo_stance_sortat_idx')
    .execute()

  await db.schema.dropIndex('collection_creator_updatedat_idx').execute()

  await db.schema.dropIndex('para_post_replyparent_idx').execute()

  await db.schema.dropIndex('para_post_replyroot_idx').execute()

  await db.schema.dropIndex('para_post_creator_sortat_idx').execute()
}
