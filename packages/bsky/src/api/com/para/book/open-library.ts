/*
 * Book autocomplete backed by Open Library (https://openlibrary.org/dev/docs/api/search).
 *
 * Free and keyless, but they ask API users to identify themselves with a
 * User-Agent and to stay modest. Results are therefore cached in memory for a
 * while and the request is bounded in time.
 */

export type BookSuggestion = {
  key: string
  title: string
  authors: string[]
  firstPublishYear?: number
}

const DEFAULT_BASE_URL = 'https://openlibrary.org'
const DEFAULT_USER_AGENT = 'PARA-AppView/1.0 (book autocomplete)'
const TIMEOUT_MS = 4000
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 500
const MAX_AUTHORS = 3

type OpenLibraryDoc = {
  key?: unknown
  title?: unknown
  author_name?: unknown
  first_publish_year?: unknown
}

const normalizeForDedupe = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** A plausible publication year; Open Library data is crowd-sourced. */
const parseYear = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1000 &&
  value <= new Date().getFullYear() + 1
    ? value
    : undefined

export const buildOpenLibraryUrl = (
  q: string,
  limit: number,
  baseUrl = DEFAULT_BASE_URL,
) => {
  const url = new URL('/search.json', baseUrl)
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year')
  // Over-fetch: several editions of a work collapse into one suggestion.
  url.searchParams.set('limit', String(Math.min(limit * 3, 30)))
  return url.toString()
}

/**
 * Turns an Open Library search response into suggestions: drops entries with
 * no title, trims authors, rejects implausible years, and collapses repeats of
 * the same title and first author.
 */
export const parseOpenLibraryResponse = (
  body: unknown,
  limit: number,
): BookSuggestion[] => {
  const docs = (body as { docs?: unknown })?.docs
  if (!Array.isArray(docs)) return []

  const seen = new Set<string>()
  const out: BookSuggestion[] = []
  for (const raw of docs as OpenLibraryDoc[]) {
    if (out.length >= limit) break
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const key = typeof raw.key === 'string' ? raw.key : ''
    if (!title || !key) continue
    const authors = Array.isArray(raw.author_name)
      ? raw.author_name
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.trim())
          .filter(Boolean)
          .slice(0, MAX_AUTHORS)
      : []
    const dedupeKey = `${normalizeForDedupe(title)}|${normalizeForDedupe(authors[0] ?? '')}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const firstPublishYear = parseYear(raw.first_publish_year)
    out.push({
      key,
      title,
      authors,
      ...(firstPublishYear !== undefined ? { firstPublishYear } : {}),
    })
  }
  return out
}

type CacheEntry = { expires: number; books: BookSuggestion[] }
const cache = new Map<string, CacheEntry>()

export const clearBookSearchCache = () => cache.clear()

export type BookSearchOptions = {
  fetchImpl?: typeof fetch
  baseUrl?: string
  userAgent?: string
  now?: () => number
}

export const searchOpenLibrary = async (
  q: string,
  limit: number,
  opts: BookSearchOptions = {},
): Promise<BookSuggestion[]> => {
  const now = opts.now ?? Date.now
  const cacheKey = `${limit}:${normalizeForDedupe(q)}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > now()) return hit.books

  const fetchImpl = opts.fetchImpl ?? fetch
  const res = await fetchImpl(buildOpenLibraryUrl(q, limit, opts.baseUrl), {
    headers: {
      'user-agent': opts.userAgent ?? DEFAULT_USER_AGENT,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Open Library responded ${res.status}`)
  }
  const books = parseOpenLibraryResponse(await res.json(), limit)

  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Maps iterate in insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(cacheKey, { expires: now() + CACHE_TTL_MS, books })
  return books
}
