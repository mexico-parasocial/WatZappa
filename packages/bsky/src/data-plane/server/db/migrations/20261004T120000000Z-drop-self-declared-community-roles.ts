import { type Kysely, sql } from 'kysely'

/*
 * `20260929T120000000Z-add-community-authority-events` turned the `owner` and
 * `moderator` roles in membership records into authority events (basis
 * `migration`). Members write their own membership record, so those roles
 * were self-declared: the only legitimate one was the role `createBoard`
 * wrote for the board's creator. This removes the migrated role grants of
 * everyone else. Migrated `member.activate` events stay: a membership record
 * does establish membership.
 *
 * Deliberately irreversible: `down` cannot restore the deleted rows, which
 * granted roles nobody issued. A role is restored by a verified authority
 * event (for example an owner appointment or an assembly decision).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM para_community_authority_event event
    WHERE event.basis = 'migration'
      AND event.action IN ('owner.grant', 'moderator.grant')
      AND NOT EXISTS (
        SELECT 1 FROM para_community_board board
        WHERE board.uri = event."communityUri"
          AND board.creator = event.subject
      )
  `.execute(db)
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Deleted rows cannot be restored; see the note above.
}
