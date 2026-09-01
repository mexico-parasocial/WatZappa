import { DAY, MINUTE } from '@atproto/common'
import { DidString, HandleString, INVALID_HANDLE } from '@atproto/syntax'
import {
  AuthRequiredError,
  MethodRateLimit,
  Server,
} from '@atproto/xrpc-server'
import { formatAccountStatus } from '../../../../account-manager/account-manager.js'
import { OLD_PASSWORD_MAX_LENGTH } from '../../../../account-manager/helpers/scrypt.js'
import { validateIm8Token } from '../../../../account-manager/helpers/im8-token.js'
import { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { didDocForSession } from './util.js'

export default function (server: Server, ctx: AppContext) {
  const { entrywayClient } = ctx

  const rateLimit: MethodRateLimit<
    void,
    com.atproto.server.createSession.$Params,
    com.atproto.server.createSession.$Input
  > = [
    {
      durationMs: DAY,
      points: 300,
      calcKey: ({ input, req }) => `${input.body.identifier}-${req.ip}`,
    },
    {
      durationMs: 5 * MINUTE,
      points: 30,
      calcKey: ({ input, req }) => `${input.body.identifier}-${req.ip}`,
    },
  ]

  if (entrywayClient) {
    server.add(com.atproto.server.createSession, {
      rateLimit,
      handler: async ({ input: { body }, req }) => {
        const { headers } = ctx.entrywayPassthruHeaders(req)
        return entrywayClient.xrpc(com.atproto.server.createSession, {
          headers,
          body,
        })
      },
    })
  } else {
    server.add(com.atproto.server.createSession, {
      rateLimit,
      handler: async ({
        input: { body },
      }): Promise<com.atproto.server.createSession.$Output> => {
        if (body.password.length > OLD_PASSWORD_MAX_LENGTH) {
          throw new AuthRequiredError(
            'Password too long. Consider resetting your password.',
          )
        }

        const { user, isSoftDeleted, appPassword } =
          await ctx.accountManager.login(body)

        // Auth factor check: if account requires 2FA and no token provided
        if (user.authFactorType && !body.authFactorToken) {
          throw new AuthRequiredError(
            'Auth factor token required',
            'AuthFactorTokenRequired',
          )
        }

        // Validate iM8 auth factor token
        if (user.authFactorType === 'im8' && body.authFactorToken) {
          const m8BaseUrl = ctx.cfg.m8BaseUrl
          if (!m8BaseUrl) {
            throw new AuthRequiredError(
              'M8 identity broker is not configured',
              'AuthFactorTokenRequired',
            )
          }
          try {
            const session = await validateIm8Token(m8BaseUrl, body.authFactorToken)
            if (session.did !== user.did) {
              throw new AuthRequiredError(
                'Auth factor token does not match account',
                'AuthFactorTokenRequired',
              )
            }
          } catch {
            throw new AuthRequiredError(
              'Invalid auth factor token',
              'AuthFactorTokenRequired',
            )
          }
        }

        if (!body.allowTakendown && isSoftDeleted) {
          throw new AuthRequiredError(
            'Account has been taken down',
            'AccountTakedown',
          )
        }

        const [{ accessJwt, refreshJwt }, didDoc] = await Promise.all([
          ctx.accountManager.createSession(
            user.did,
            appPassword,
            isSoftDeleted,
          ),
          didDocForSession(ctx, user.did),
        ])

        const { status, active } = formatAccountStatus(user)

        return {
          encoding: 'application/json',
          body: {
            accessJwt,
            refreshJwt,

            did: user.did as DidString,
            // @ts-expect-error https://github.com/bluesky-social/atproto/pull/4406
            didDoc,
            handle: (user.handle ?? INVALID_HANDLE) as HandleString,
            email: user.email ?? undefined,
            emailConfirmed: !!user.emailConfirmedAt,
            emailAuthFactor: user.authFactorType === 'email',
            active,
            status,
          },
        }
      },
    })
  }
}
