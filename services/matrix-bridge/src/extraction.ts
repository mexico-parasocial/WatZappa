import { randomUUID } from 'node:crypto'
import type { BridgeDatabase } from './db.js'

export interface ExtractedCard {
  id: string
  title: string
  content: string
  cardType: string
  sourceUrl?: string
  entities: Array<{ type: string; value: string }>
  policyRefs: string[]
}

export interface SuggestedRelationship {
  id: string
  sourceCardId: string
  targetCardId: string
  relationshipType: string
  confidence: number
  reason: string
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const MENTION_REGEX = /@([a-zA-Z0-9._-]+)/g

// Spanish/English organization indicators
const ORG_INDICATORS = [
  'fundación',
  'asociación',
  'cooperativa',
  'colectivo',
  'colectiva',
  'organización',
  'instituto',
  'universidad',
  'municipio',
  'ayuntamiento',
  'gobierno',
  'ministerio',
  'secretaría',
  'cámara',
  'comisión',
  'foundation',
  'association',
  'cooperative',
  'collective',
  'organization',
  'institute',
  'university',
  'municipality',
  'government',
  'ministry',
  'secretariat',
  'chamber',
  'commission',
]

// Simple keyword-based policy reference detection
const POLICY_KEYWORDS = [
  'cabildeo',
  'propuesta',
  'presupuesto',
  'presupuesto participativo',
  'moción',
  'iniciativa',
  'ley',
  'reglamento',
  'ordenanza',
  'decreto',
  'resolución',
  'plan',
  'programa',
  'proyecto',
]

// Stance indicators for relationship typing
const STANCE_SUPPORT = [
  'de acuerdo',
  'apoyo',
  'apoyar',
  'correcto',
  'bien dicho',
  'exacto',
  'concuerdo',
  'estoy de acuerdo',
  'me parece bien',
  '+1',
  'agree',
  'support',
  'correct',
  'well said',
  'exactly',
  'concur',
]
const STANCE_OPPOSE = [
  'no estoy de acuerdo',
  'en contra',
  'rechazo',
  'oposición',
  'discrepo',
  'no concuerdo',
  'me parece mal',
  'no me convence',
  'falso',
  'erróneo',
  'disagree',
  'oppose',
  'reject',
  'false',
  'wrong',
  'not convinced',
]
const STANCE_EXPLAINER = [
  'porque',
  'debido a',
  'explicación',
  'se debe a',
  'la razón',
  'because',
  'due to',
  'explanation',
  'the reason',
  'caused by',
]
const STANCE_COMPARE = [
  'similar a',
  'comparado con',
  'versus',
  'al contrario',
  'en contraste',
  'mientras que',
  'por otro lado',
  'similar to',
  'compared to',
  'unlike',
]

/**
 * Detect stance from text for relationship typing.
 */
function detectStance(
  text: string,
): 'supports' | 'opposes' | 'explainer' | 'compares_to' | null {
  const lower = text.toLowerCase()
  if (STANCE_SUPPORT.some((w) => lower.includes(w))) return 'supports'
  if (STANCE_OPPOSE.some((w) => lower.includes(w))) return 'opposes'
  if (STANCE_EXPLAINER.some((w) => lower.includes(w))) return 'explainer'
  if (STANCE_COMPARE.some((w) => lower.includes(w))) return 'compares_to'
  return null
}

/**
 * Extract capitalized multi-word phrases that look like organizations.
 */
function extractOrganizations(
  text: string,
): Array<{ type: string; value: string }> {
  const entities: Array<{ type: string; value: string }> = []
  // Pattern: OrgIndicator + CapitalizedWords
  for (const indicator of ORG_INDICATORS) {
    const regex = new RegExp(
      `\\b${indicator}\\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){0,4})`,
      'gi',
    )
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      entities.push({
        type: 'organization',
        value: `${indicator.charAt(0).toUpperCase() + indicator.slice(1)} ${match[1]}`,
      })
    }
  }

  // Also catch "X de Y" patterns like "Mesa de Participación Ciudadana"
  const dePattern =
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){0,2}\s+de\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*){0,2})/g
  let deMatch: RegExpExecArray | null
  while ((deMatch = dePattern.exec(text)) !== null) {
    const val = deMatch[1].trim()
    if (val.length > 5 && !entities.some((e) => e.value === val)) {
      entities.push({ type: 'organization', value: val })
    }
  }

  return entities
}

/**
 * Extract locations from text (simple heuristic).
 */
function extractLocations(
  text: string,
): Array<{ type: string; value: string }> {
  const entities: Array<{ type: string; value: string }> = []
  const commonPlaces = [
    'madrid',
    'barcelona',
    'valencia',
    'sevilla',
    'bilbao',
    'zaragoza',
    'málaga',
    'murcia',
    'palma',
    'las palmas',
    'alicante',
    'cdmx',
    'ciudad de méxico',
    'guadalajara',
    'monterrey',
    'puebla',
    'bogotá',
    'medellín',
    'cali',
    'cartagena',
    'barranquilla',
    'buenos aires',
    'córdoba',
    'rosario',
    'mendoza',
    'santiago',
    'valparaíso',
    'concepción',
    'lima',
    'arequipa',
    'cusco',
    'trujillo',
    'caracas',
    'valencia',
    'maracaibo',
  ]
  const lower = text.toLowerCase()
  for (const place of commonPlaces) {
    if (lower.includes(place)) {
      entities.push({ type: 'location', value: place })
    }
  }
  return entities
}

/**
 * Lightweight extraction engine for deliberation cards.
 */
export function extractFromText(
  text: string,
  _opts: {
    roomId?: string
    eventId?: string
    sender?: string
    communityUri?: string
    relatesTo?: { eventId: string } | null
  },
): ExtractedCard | null {
  if (!text || text.length < 5) return null

  const urls = text.match(URL_REGEX) ?? []
  const firstUrl = urls[0]

  // Detect card type from URL or content
  let cardType = 'claim'
  if (firstUrl) {
    if (/youtube|vimeo|tiktok/.test(firstUrl)) cardType = 'video'
    else if (/spotify|soundcloud|podcast/.test(firstUrl)) cardType = 'audio'
    else if (/eventbrite|meetup|calendly/.test(firstUrl)) cardType = 'event'
    else if (/twitter|x\.com|bsky\.app/.test(firstUrl)) cardType = 'social'
    else if (/amazon|goodreads|library/.test(firstUrl)) cardType = 'book'
    else if (/arxiv|researchgate|doi\.org/.test(firstUrl)) cardType = 'research'
    else cardType = 'link'
  }

  // Detect questions
  const trimmed = text.trim()
  if (
    /\?$/.test(trimmed) ||
    /^\s*(?:qué|cómo|cuándo|dónde|por qué|quién|cuál|cuáles|quiénes|what|how|when|where|why|who|which)\b/gi.test(
      trimmed,
    )
  ) {
    cardType = 'question'
  }

  // Detect policy references
  const lowerText = text.toLowerCase()
  const policyRefs = POLICY_KEYWORDS.filter((kw) => lowerText.includes(kw))

  // Entity extraction
  const entities: Array<{ type: string; value: string }> = []

  // Mentions → person
  const mentions = text.match(MENTION_REGEX) ?? []
  for (const mention of mentions) {
    entities.push({ type: 'person', value: mention.replace('@', '') })
  }

  // Hashtags → topic
  const hashtags = text.match(/#([a-zA-Z0-9_\u00f1\u00d1]+)/g) ?? []
  for (const tag of hashtags) {
    entities.push({ type: 'topic', value: tag })
  }

  // URLs → source
  for (const url of urls) {
    entities.push({ type: 'url', value: url })
  }

  // Organizations
  entities.push(...extractOrganizations(text))

  // Locations
  entities.push(...extractLocations(text))

  // Policy refs as entities too
  for (const pr of policyRefs) {
    entities.push({ type: 'policy', value: pr })
  }

  // Title: first sentence or truncated text
  const title = text.split(/[.!?]/, 1)[0].slice(0, 120) || text.slice(0, 120)

  return {
    id: randomUUID(),
    title,
    content: text,
    cardType,
    sourceUrl: firstUrl,
    entities,
    policyRefs,
  }
}

/**
 * Persist an extracted card to the database.
 */
export function persistExtractedCard(
  db: BridgeDatabase,
  card: ExtractedCard,
  opts: {
    communityUri: string
    authorDid: string
    roomId?: string
    eventId?: string
  },
): void {
  db.insertCard({
    id: card.id,
    communityUri: opts.communityUri,
    authorDid: opts.authorDid,
    title: card.title,
    content: card.content,
    cardType: card.cardType,
    sourceRoomId: opts.roomId,
    sourceEventId: opts.eventId,
    sourceUrl: card.sourceUrl,
    metadata: JSON.stringify({
      policyRefs: card.policyRefs,
      extractedBy: 'ner-v2',
      entityCount: card.entities.length,
    }),
  })

  for (const entity of card.entities) {
    db.insertEntity({
      cardId: card.id,
      entityType: entity.type,
      entityValue: entity.value,
    })
  }
}

/**
 * Find existing cards in the same community that share entities with the new card,
 * and generate suggested relationships.
 */
export function generateRelationshipSuggestions(
  db: BridgeDatabase,
  newCard: ExtractedCard,
  opts: {
    communityUri: string
    authorDid: string
    stanceText?: string
  },
): SuggestedRelationship[] {
  const suggestions: SuggestedRelationship[] = []
  if (newCard.entities.length === 0) return suggestions

  // Get existing cards in the same community (excluding the new one if already persisted)
  const existingCards = db.getCardsForCommunity(opts.communityUri, {
    limit: 200,
  })

  // Build entity value sets for quick lookup
  const newEntityValues = new Set(
    newCard.entities.map((e) => e.value.toLowerCase()),
  )

  for (const existing of existingCards) {
    if (existing.id === newCard.id) continue

    const existingEntities = db.getEntitiesForCard(existing.id)
    const sharedEntities: string[] = []

    for (const ee of existingEntities) {
      const ev = (ee.entity_value as string).toLowerCase()
      if (newEntityValues.has(ev)) {
        sharedEntities.push(ev)
      }
    }

    if (sharedEntities.length === 0) continue

    // Determine relationship type
    let relType = 'addresses'
    let confidence = 0.4 + sharedEntities.length * 0.15

    // Stance detection overrides
    const stance = opts.stanceText ? detectStance(opts.stanceText) : null
    if (stance) {
      relType = stance
      confidence += 0.2
    }

    // Boost confidence for multiple shared entities
    confidence = Math.min(0.95, confidence)

    suggestions.push({
      id: randomUUID(),
      sourceCardId: newCard.id,
      targetCardId: existing.id,
      relationshipType: relType,
      confidence,
      reason: `Shared ${sharedEntities.length > 1 ? 'entities' : 'entity'}: ${sharedEntities.join(', ')}`,
    })
  }

  // Sort by confidence descending, keep top 5
  suggestions.sort((a, b) => b.confidence - a.confidence)
  return suggestions.slice(0, 5)
}

/**
 * Persist suggested relationships to the database.
 */
export function persistSuggestions(
  db: BridgeDatabase,
  suggestions: SuggestedRelationship[],
): void {
  for (const s of suggestions) {
    try {
      db.insertSuggestedRelationship(s)
    } catch {
      // Duplicate suggestion — ignore
    }
  }
}
