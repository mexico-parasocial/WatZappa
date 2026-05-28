import { DatetimeString, DidString } from '@atproto/lex'

export interface AlphaRollout {
  state: string
  totalSlots: number
  usedSlots: number
  isOpen: 0 | 1
  openedAt: DatetimeString | null
}

export interface AlphaInvite {
  code: string
  state: string
  did: DidString | null
  createdBy: DidString
  createdAt: DatetimeString
  usedAt: DatetimeString | null
}

export interface AlphaAccessRequest {
  did: DidString
  state: string
  inviteCode: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: DatetimeString
  approvedAt: DatetimeString | null
}

export const rolloutTableName = 'alpha_rollout'
export const inviteTableName = 'alpha_invite'
export const requestTableName = 'alpha_access_request'

export type PartialDB = {
  [rolloutTableName]: AlphaRollout
  [inviteTableName]: AlphaInvite
  [requestTableName]: AlphaAccessRequest
}
