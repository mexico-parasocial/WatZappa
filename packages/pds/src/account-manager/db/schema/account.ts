import type { Generated, Selectable } from 'kysely'
import type { DatetimeString } from '@atproto/lex'

export interface Account {
  did: string
  email: string
  passwordScrypt: string
  emailConfirmedAt: DatetimeString | null
  invitesDisabled: Generated<0 | 1>
  // PARA: second factor verified by the m8 identity broker (migration 010).
  // Email OTP is the separate `account_email_auth_factor` table.
  authFactorType: 'im8' | null
}

export type AccountEntry = Selectable<Account>

export const tableName = 'account'

export type PartialDB = { [tableName]: Account }
