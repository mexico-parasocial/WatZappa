import type { SpaceRefString } from '@atproto/syntax'

export interface SpaceDeletedNotificationRetry {
  space: SpaceRefString
  service: string
  generation: string
  attempts: number
  retryAt: number
  expiresAt: number
}

export type PartialDB = {
  space_deleted_notification_retry: SpaceDeletedNotificationRetry
  space_deleted_notification_lease: {
    id: number
    owner: string
    expiresAt: number
  }
}
