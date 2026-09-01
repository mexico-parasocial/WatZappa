import http from 'node:http'
import { type AddressInfo } from 'node:net'

/**
 * Local stand-in for Bluesky's internal suggestions / topics / IRIS agents.
 *
 * Several AppView routes (app.bsky.unspecced.getTrends, getTrendingTopics,
 * getSuggestedUsers*, getSuggestedFeeds, getSuggestedStarterPacks) delegate
 * their skeleton step to those private production services and throw
 * MethodNotImplementedError when they are not configured. This stub implements
 * the skeleton endpoints they call, returning the seeded demo actors so the
 * local dev environment gets real, hydratable data instead of 501s.
 *
 * Responses must satisfy the lexicons under packages/bsky/src/lexicons/app/
 * bsky/unspecced/ — the AppView validates them when debugMode is on.
 */

export interface StubUser {
  did: string
  name?: string
  party?: string
}

interface StubTopic {
  topic: string
  displayName: string
  description?: string
}

// Demo topics aligned with the PARA civic seed content. `link` follows the
// canonical bsky.app search-link format the clients navigate with.
const STUB_TOPICS: StubTopic[] = [
  { topic: 'Reforma Electoral', displayName: 'Reforma Electoral' },
  { topic: 'Presupuesto', displayName: 'Presupuesto 2026' },
  { topic: 'Transparencia', displayName: 'Transparencia' },
  { topic: 'Cabildeo', displayName: 'Cabildeo Legislativo' },
  { topic: 'Género', displayName: 'Género y Política' },
]

const NSIDS = {
  getTrendingTopics: 'app.bsky.unspecced.getTrendingTopics',
  getTrendsSkeleton: 'app.bsky.unspecced.getTrendsSkeleton',
  getSuggestedUsersSkeleton: 'app.bsky.unspecced.getSuggestedUsersSkeleton',
  getSuggestedUsersForExploreSkeleton:
    'app.bsky.unspecced.getSuggestedUsersForExploreSkeleton',
  getSuggestedUsersForSeeMoreSkeleton:
    'app.bsky.unspecced.getSuggestedUsersForSeeMoreSkeleton',
  getSuggestedUsersForDiscoverSkeleton:
    'app.bsky.unspecced.getSuggestedUsersForDiscoverSkeleton',
  getOnboardingSuggestedUsersSkeleton:
    'app.bsky.unspecced.getOnboardingSuggestedUsersSkeleton',
  getSuggestedFeedsSkeleton: 'app.bsky.unspecced.getSuggestedFeedsSkeleton',
  getSuggestedStarterPacksSkeleton:
    'app.bsky.unspecced.getSuggestedStarterPacksSkeleton',
  getOnboardingSuggestedStarterPacksSkeleton:
    'app.bsky.unspecced.getOnboardingSuggestedStarterPacksSkeleton',
} as const

function searchLink(topic: string) {
  return `https://bsky.app/search?q=${encodeURIComponent(topic)}`
}

export class SuggestionsAgentStub {
  private server: http.Server
  private port = 0
  private users: StubUser[] = []

  constructor() {
    this.server = http.createServer((req, res) => {
      try {
        this.handle(req, res)
      } catch (err) {
        res.writeHead(500, {'content-type': 'application/json'})
        res.end(JSON.stringify({error: 'InternalServerError'}))
      }
    })
  }

  static async start(): Promise<SuggestionsAgentStub> {
    const stub = new SuggestionsAgentStub()
    await new Promise<void>((resolve, reject) => {
      stub.server.once('error', reject)
      stub.server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = stub.server.address() as AddressInfo
    stub.port = addr.port
    return stub
  }

  get url() {
    return `http://127.0.0.1:${this.port}`
  }

  /** Called after the para demo seed completes, once user DIDs exist. */
  setUsers(users: StubUser[]) {
    this.users = users.filter((u) => u.did)
  }

  destroy() {
    this.server.close()
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`)
    const nsid = url.pathname.replace(/^\/xrpc\//, '')
    const limit = clampInt(url.searchParams.get('limit'), 1, 50, 25)

    const json = (body: unknown) => {
      res.writeHead(200, {'content-type': 'application/json'})
      res.end(JSON.stringify(body))
    }

    switch (nsid) {
      case NSIDS.getSuggestedUsersSkeleton:
      case NSIDS.getSuggestedUsersForExploreSkeleton:
      case NSIDS.getSuggestedUsersForSeeMoreSkeleton:
      case NSIDS.getSuggestedUsersForDiscoverSkeleton:
      case NSIDS.getOnboardingSuggestedUsersSkeleton:
        return json({dids: this.users.slice(0, limit).map((u) => u.did)})

      case NSIDS.getTrendsSkeleton: {
        const dids = this.users.slice(0, 3).map((u) => u.did)
        return json({
          trends: STUB_TOPICS.slice(0, limit).map((t) => ({
            $type: 'app.bsky.unspecced.defs#skeletonTrend',
            topic: t.topic,
            displayName: t.displayName,
            description: t.description,
            link: searchLink(t.topic),
            startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            postCount: 12 + ((t.topic.length * 7) % 40),
            dids,
          })),
        })
      }

      case NSIDS.getTrendingTopics:
        return json({
          topics: STUB_TOPICS.map((t) => ({
            $type: 'app.bsky.unspecced.defs#trendingTopic',
            topic: t.topic,
            displayName: t.displayName,
            description: t.description,
            link: searchLink(t.topic),
          })),
          suggested: [],
        })

      case NSIDS.getSuggestedFeedsSkeleton:
        return json({feeds: []})

      case NSIDS.getSuggestedStarterPacksSkeleton:
      case NSIDS.getOnboardingSuggestedStarterPacksSkeleton:
        return json({starterPacks: []})

      default:
        res.writeHead(404, {'content-type': 'application/json'})
        return res.end(JSON.stringify({error: 'XRPCNotSupported'}))
    }
  }
}

function clampInt(raw: string | null, min: number, max: number, fallback: number) {
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}
