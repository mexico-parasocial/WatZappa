import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../context.js'
import { modEventToEventView, publishableEventTypes } from '../../history/views.js'
import { Server } from '../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.tools.ozone.history.getSubjectHistory({
    auth: ctx.authVerifier.standardOptionalOrAdminToken,
    handler: async ({ auth, params }) => {
      const access = auth.credentials
      const { subject, limit = 50, cursor } = params
      const db = ctx.db
      const modService = ctx.modService(db)

      if (!subject) {
        throw new InvalidRequestError('Subject parameter is required')
      }

      // Parse subject to check ownership
      const subjectDid = subject.startsWith('at://')
        ? subject.split('/')[2]
        : subject

      // Users can only view history for subjects they own
      // Moderators/admins can view any subject
      let isAuthorized = false
      if (access.type === 'admin_token') {
        isAuthorized = true
      } else if (access.type === 'standard') {
        isAuthorized =
          access.isModerator || access.isAdmin || access.iss === subjectDid
      }

      if (!isAuthorized) {
        throw new InvalidRequestError('Unauthorized')
      }

      const results = await modService.getEvents({
        subject,
        limit,
        cursor,
        types: [...publishableEventTypes],
        includeAllUserRecords: false,
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
