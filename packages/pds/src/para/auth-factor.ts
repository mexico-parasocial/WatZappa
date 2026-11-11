import type { DidString } from '@atproto/syntax'
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import type { AccountManager } from '../account-manager/account-manager.js'
import {
  type ActorAccount,
  updateAuthFactorType as setAuthFactorType,
} from '../account-manager/helpers/account.js'
import { validateIm8Token } from '../account-manager/helpers/im8-token.js'
import type { AppContext } from '../context.js'

/**
 * PARA: accounts with an iM8 second factor sign in with an m8 session token for
 * the same DID, app passwords included. Called from `createSession` after
 * `login({ im8FactorVerifiedByCaller: true })`, which skips the email-OTP
 * checks for those accounts.
 */
export async function assertParaAuthFactor(
  ctx: AppContext,
  user: Pick<ActorAccount, 'did' | 'authFactorType'>,
  authFactorToken: string | undefined,
): Promise<void> {
  if (user.authFactorType !== 'im8') return

  if (!authFactorToken) {
    throw new AuthRequiredError(
      'Auth factor token required',
      'AuthFactorTokenRequired',
    )
  }
  const m8BaseUrl = ctx.cfg.m8BaseUrl
  if (!m8BaseUrl) {
    throw new AuthRequiredError(
      'M8 identity broker is not configured',
      'AuthFactorTokenRequired',
    )
  }
  const session = await validateIm8Token(m8BaseUrl, authFactorToken).catch(
    () => null,
  )
  if (session?.did !== user.did) {
    throw new AuthRequiredError(
      'Invalid auth factor token',
      'AuthFactorTokenRequired',
    )
  }
}

export async function updateAuthFactorType(
  accountManager: AccountManager,
  did: DidString,
  authFactorType: 'im8' | null,
): Promise<ActorAccount> {
  const account = await accountManager.getAccount(did, {
    includeDeactivated: true,
    includeTakenDown: true,
  })
  if (!account) {
    throw new InvalidRequestError('account not found')
  }
  await setAuthFactorType(accountManager.db, did, authFactorType)
  account.authFactorType = authFactorType
  return account
}
