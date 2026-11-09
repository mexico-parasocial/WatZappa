import type { Kysely } from 'kysely'

/**
 * Once rebuilt the derived authority of boards, replaying every authority
 * event through its verifier. Authority events are retired (OD-9 phase 5) and
 * their table is dropped by a later migration, so there is nothing left to
 * rebuild; the migration stays so the history still lines up.
 */
export async function up(_db: Kysely<unknown>): Promise<void> {}

export async function down(_db: Kysely<unknown>): Promise<void> {}
