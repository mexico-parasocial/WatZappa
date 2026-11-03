import type { ServerResponse } from 'node:http'
import { HttpError } from './m8-auth.js'
import type { MatrixAdminClient } from './matrix.js'

/**
 * Chat-off mode (`MATRIX_CHAT_ENABLED=false`): the bridge serves governance
 * without a homeserver. A first step toward the CD-M2 governance/provisioner
 * split in docs/MATRIX_V2.md.
 */

/** Stable error code clients match on; never translated or reworded. */
export const CHAT_DISABLED = 'CHAT_DISABLED'

export class ChatDisabledError extends HttpError {
  readonly code = CHAT_DISABLED
  constructor() {
    super(503, CHAT_DISABLED)
  }
}

export function writeChatDisabled(res: ServerResponse): void {
  res.writeHead(503, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      error: CHAT_DISABLED,
      message: 'Chat is not enabled on this server',
    }),
  )
}

/** The admin client, or a 503 CHAT_DISABLED when chat is off. */
export function requireMatrix(
  matrix: MatrixAdminClient | null,
): MatrixAdminClient {
  if (!matrix) throw new ChatDisabledError()
  return matrix
}

/*
 * Governance keeps its per-community facts (chamber mode, who sits where) on
 * the space-map row, so a community created while chat is off still gets one.
 * It holds this marker instead of a Matrix room id; real room ids start with
 * `!`, so the two cannot collide. Once chat is on, the create_space retry job
 * (or backfill.ts) provisions the space and overwrites the row.
 */
const UNPROVISIONED_SPACE_PREFIX = 'para-unprovisioned:'

export function unprovisionedSpaceId(communityUri: string): string {
  return `${UNPROVISIONED_SPACE_PREFIX}${communityUri}`
}

/** False for a space-map row written while chat was off. */
export function isProvisionedSpace(space: { spaceId: string }): boolean {
  return !space.spaceId.startsWith(UNPROVISIONED_SPACE_PREFIX)
}
