// @ts-nocheck
import { UpstreamFailureError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { searchOpenLibrary } from './open-library.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.book.searchBooks', {
    // A signed-in viewer is required: the endpoint spends a shared, free
    // third-party quota, so it is not open to anonymous traffic.
    auth: ctx.authVerifier.standard,
    handler: async ({ params }) => {
      const q = String(params.q ?? '').trim()
      const limit = Math.min(Math.max(Number(params.limit) || 8, 1), 10)
      if (q.length < 2) {
        return { encoding: 'application/json' as const, body: { books: [] } }
      }
      try {
        const books = await searchOpenLibrary(q, limit, {
          baseUrl: process.env.PARA_OPEN_LIBRARY_URL || undefined,
          userAgent: process.env.PARA_BOOK_SEARCH_USER_AGENT || undefined,
        })
        return { encoding: 'application/json' as const, body: { books } }
      } catch {
        // Autocomplete is a convenience; the client falls back to typing.
        throw new UpstreamFailureError('Book search is unavailable right now.')
      }
    },
  })
}
