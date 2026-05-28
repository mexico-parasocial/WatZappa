import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../context.js'
import { modEventToEventView, publishableEventTypes } from '../../history/views.js'
import { Server } from '../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.tools.ozone.history.getReportedSubjects({
    auth: ctx.authVerifier.standardOptionalOrAdminToken,
    handler: async ({ auth, params }) => {
      const access = auth.credentials
      const { limit = 50, cursor, sortDirection = 'desc' } = params
      const db = ctx.db
      const modService = ctx.modService(db)

      // If this is a moderator/admin request, we allow fetching any account's reports
      // Otherwise, users can only fetch their own reported subjects
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

      // Get reports created by this user
      const results = await modService.getEvents({
        createdBy: requesterDid,
        limit,
        cursor,
        sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
        types: ['tools.ozone.moderation.defs#modEventReport'],
        includeAllUserRecords: false,
        addedLabels: [],
        removedLabels: [],
        addedTags: [],
        removedTags: [],
        collections: [],
      })

      // Group events by subject and build reportedSubjectViews
      const subjectMap = new Map<
        string,
        {
          subject: string
          comment?: string
          createdAt: string
          status: 'open' | 'closed' | 'escalated' | 'queued' | 'assigned'
          actions: any[]
        }
      >()

      for (const event of results.events) {
        const subject = event.subjectUri || event.subjectDid
        if (!subjectMap.has(subject)) {
          subjectMap.set(subject, {
            subject,
            comment: event.comment || undefined,
            createdAt: event.createdAt,
            status: 'open',
            actions: [],
          })
        }
      }

      // For each subject, fetch moderation actions
      for (const [subject, subjectView] of subjectMap) {
        const actionResults = await modService.getEvents({
          subject,
          limit: 50,
          types: [...publishableEventTypes],
          includeAllUserRecords: false,
          addedLabels: [],
          removedLabels: [],
          addedTags: [],
          removedTags: [],
          collections: [],
        })

        subjectView.actions = actionResults.events
          .map((event) => modEventToEventView(event))
          .filter((event): event is NonNullable<typeof event> => event !== null)
      }

      return {
        encoding: 'application/json',
        body: {
          subjects: Array.from(subjectMap.values()),
          cursor: results.cursor,
        },
      }
    },
  })
}
