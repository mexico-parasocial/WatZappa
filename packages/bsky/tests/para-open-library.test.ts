import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildOpenLibraryUrl,
  clearBookSearchCache,
  parseOpenLibraryResponse,
  searchOpenLibrary,
} from '../src/api/com/para/book/open-library.js'

describe('parseOpenLibraryResponse', () => {
  it('maps title, authors and first publication year', () => {
    expect(
      parseOpenLibraryResponse(
        {
          docs: [
            {
              key: '/works/OL1W',
              title: ' La democracia en América ',
              author_name: ['Alexis de Tocqueville'],
              first_publish_year: 1835,
            },
          ],
        },
        8,
      ),
    ).toEqual([
      {
        key: '/works/OL1W',
        title: 'La democracia en América',
        authors: ['Alexis de Tocqueville'],
        firstPublishYear: 1835,
      },
    ])
  })

  it('keeps at most three authors and tolerates missing fields', () => {
    const [book] = parseOpenLibraryResponse(
      {
        docs: [
          {
            key: '/works/OL2W',
            title: 'Anthology',
            author_name: ['A', 'B', 'C', 'D'],
          },
        ],
      },
      8,
    )
    expect(book.authors).toEqual(['A', 'B', 'C'])
    expect(book).not.toHaveProperty('firstPublishYear')
  })

  it('drops untitled entries and implausible years', () => {
    const books = parseOpenLibraryResponse(
      {
        docs: [
          { key: '/works/OL3W', title: '' },
          { key: '/works/OL4W', title: 'Odd', first_publish_year: 12 },
          { title: 'No key' },
          { key: '/works/OL5W', title: 'Future', first_publish_year: 9999 },
        ],
      },
      8,
    )
    expect(books.map((b) => b.key)).toEqual(['/works/OL4W', '/works/OL5W'])
    expect(books.every((b) => b.firstPublishYear === undefined)).toBe(true)
  })

  it('collapses repeated title and author, ignoring case and accents', () => {
    const books = parseOpenLibraryResponse(
      {
        docs: [
          {
            key: '/works/A',
            title: 'Pedro Páramo',
            author_name: ['Juan Rulfo'],
          },
          {
            key: '/works/B',
            title: 'pedro paramo',
            author_name: ['JUAN RULFO'],
          },
          {
            key: '/works/C',
            title: 'Pedro Páramo',
            author_name: ['Someone Else'],
          },
        ],
      },
      8,
    )
    expect(books.map((b) => b.key)).toEqual(['/works/A', '/works/C'])
  })

  it('respects the limit and tolerates a malformed body', () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({
      key: `/works/${i}`,
      title: `Book ${i}`,
    }))
    expect(parseOpenLibraryResponse({ docs }, 2)).toHaveLength(2)
    expect(parseOpenLibraryResponse(null, 5)).toEqual([])
    expect(parseOpenLibraryResponse({ docs: 'nope' }, 5)).toEqual([])
  })
})

describe('buildOpenLibraryUrl', () => {
  it('asks only for the fields it uses, with no cover data', () => {
    const url = new URL(buildOpenLibraryUrl('pedro páramo', 8))
    expect(url.pathname).toBe('/search.json')
    expect(url.searchParams.get('q')).toBe('pedro páramo')
    expect(url.searchParams.get('fields')).toBe(
      'key,title,author_name,first_publish_year',
    )
    expect(url.searchParams.get('limit')).toBe('24')
  })
})

describe('searchOpenLibrary', () => {
  beforeEach(() => clearBookSearchCache())

  const respond = (docs: unknown[]) =>
    vi.fn(async () => new Response(JSON.stringify({ docs }), { status: 200 }))

  it('identifies itself and caches repeat lookups', async () => {
    const fetchImpl = respond([{ key: '/works/OL1W', title: 'Walden' }])
    const a = await searchOpenLibrary('Walden', 8, {
      fetchImpl,
      userAgent: 'PARA-test',
    })
    const b = await searchOpenLibrary(' walden ', 8, { fetchImpl })
    expect(a).toEqual(b)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const init = fetchImpl.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['user-agent']).toBe(
      'PARA-test',
    )
  })

  it('refetches once the cache entry has expired', async () => {
    const fetchImpl = respond([{ key: '/works/OL1W', title: 'Walden' }])
    let t = 0
    const now = () => t
    await searchOpenLibrary('walden', 8, { fetchImpl, now })
    t += 11 * 60 * 1000
    await searchOpenLibrary('walden', 8, { fetchImpl, now })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws on an upstream error instead of caching it', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { status: 503 }))
    await expect(searchOpenLibrary('walden', 8, { fetchImpl })).rejects.toThrow(
      /503/,
    )
    const ok = respond([{ key: '/works/OL1W', title: 'Walden' }])
    await expect(
      searchOpenLibrary('walden', 8, { fetchImpl: ok }),
    ).resolves.toHaveLength(1)
  })
})
