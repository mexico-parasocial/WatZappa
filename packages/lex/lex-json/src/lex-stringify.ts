import { LexValue } from '@atproto/lex-data'
import { LexToJsonOptions, lexToJson } from './lex-to-json.js'

/**
 * Serialize a Lex value to a JSON string.
 *
 * @param input - The Lex value to serialize.
 * @param options - Options for converting Lex values to JSON-compatible values.
 * @returns A JSON string representation of the Lex value.
 *
 * @example
 * ```typescript
 * const lexValue = { $type: 'app.bsky.feed.post', text: 'Hello world!' }
 * const json = lexStringify(lexValue)
 * console.log(json) // Output: {"$type":"app.bsky.feed.post","text":"Hello world!"}
 * ```
 */
export function lexStringify(
  input: LexValue,
  options?: LexToJsonOptions,
): string {
  const json = lexToJson(input, options)
  return JSON.stringify(json)
}
