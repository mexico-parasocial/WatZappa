import type { LexiconDoc } from '@atproto/lexicon'

/*
 * Installed alongside the frozen generated registry (see
 * ../community/civicTree/schemas.ts for why). Keep in sync with
 * lexicons/com/para/book/searchBooks.json.
 */
export const bookSchemas: LexiconDoc[] = [
  {
    lexicon: 1,
    id: 'com.para.book.searchBooks',
    defs: {
      main: {
        type: 'query',
        description:
          'Autocomplete for books: matches a partial title or author against Open Library.',
        parameters: {
          type: 'params',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 2, maxLength: 200 },
            limit: { type: 'integer', minimum: 1, maximum: 10, default: 8 },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['books'],
            properties: {
              books: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'com.para.book.searchBooks#bookSuggestion',
                },
              },
            },
          },
        },
      },
      bookSuggestion: {
        type: 'object',
        required: ['key', 'title', 'authors'],
        properties: {
          key: { type: 'string', maxLength: 100 },
          title: { type: 'string', maxLength: 500 },
          authors: {
            type: 'array',
            items: { type: 'string', maxLength: 300 },
            maxLength: 3,
          },
          firstPublishYear: { type: 'integer' },
        },
      },
    },
  },
]
