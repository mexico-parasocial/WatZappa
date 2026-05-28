import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../context.js'
import { modEventToEventView, publishableEventTypes } from '../../history/views.js'
import { Server } from '../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.tools.ozone.history.getAccountActions({
    auth: ctx.authVerifier.standardOptionalOrAdminToken,
    handler: async ({ auth, params }) => {
      const access = auth.credentials
      const { limit = 50, cursor, sortDirection = 'desc' } = params
      const db = ctx.db
      const modService = ctx.modService(db)

      // If this is a moderator/admin request, we allow fetching any account's actions
      // Otherwise, users can only fetch their own account's actions
      let requesterDid: string | undefined
      if (access.type === 'admin_token') {
        requesterDid = params.account
      } else if (access.type === 'standard') {
        requesterDid =
          access.isModerator || access.isAdmin ? params.account : access.iss
      }

      if (!requesterDid) {
        throw new InvalidRequestError('Account parameter is required')
      }

      const results = await modService.getEvents({
        subject: requesterDid,
        limit,
        cursor,
        sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
        types: [...publishableEventTypes],
        includeAllUserRecords: true,
        addedLabels: [],
        removedLabels: [],
        addedTags: [],
        removedTags: [],
        collections: [],
      })

      return {
        encoding: 'application/json',
        body: {
          events: results.events
            .map((event) => modEventToEventView(event))
            .filter(
              (event): event is NonNullable<typeof event> => event !== null,
            ),
          cursor: results.cursor,
        },
      }
    },
  })
}
