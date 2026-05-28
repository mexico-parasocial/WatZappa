export * as app from './lexicons/app.js'
export * as chat from './lexicons/chat.js'
export * as com from './lexicons/com.js'
export * as tools from './lexicons/tools.js'

// Compatibility bridge for the legacy generated server/types surface.
export {
  ids,
  lexicons,
  schemaDict,
  schemas,
  validate,
} from './lexicon/lexicons.js'
