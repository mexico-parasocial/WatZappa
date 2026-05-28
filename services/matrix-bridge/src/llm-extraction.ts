import { randomUUID } from 'node:crypto'
import type { BridgeDatabase } from './db.js'
import type { OpenAIClient } from './openai-client.js'

export interface LLMEnrichmentResult {
  entities: Array<{ type: string; value: string }>
  stance: 'pro' | 'con' | 'neutral' | null
  topics: string[]
  summary: string
  tokensUsed: { prompt: number; completion: number }
}

export interface LLMRelationshipSuggestion {
  targetCardId: string
  relationshipType: string
  reason: string
  confidence: number
}

const ENRICHMENT_PROMPT = `You are a civic deliberation analyst. Analyze the following community discussion message and extract structured information.

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "entities": [
    {"type": "person|organization|policy|topic|location", "value": "..."}
  ],
  "stance": "pro|con|neutral",
  "topics": ["topic1", "topic2"],
  "summary": "One-sentence summary of the claim"
}

Rules:
- entities: Extract real named entities, not generic words. Include people, organizations, policies/laws, locations, and hashtag-style topics.
- stance: "pro" if supporting something, "con" if opposing, "neutral" if informational.
- topics: 1-3 broad topic tags (e.g., "transporte", "presupuesto", "educación").
- summary: Maximum 20 words.

Message:`

const RELATIONSHIP_PROMPT = `You are analyzing connections between claims in a civic deliberation space.

Given a NEW claim and a list of EXISTING claims, identify which existing claims the new claim relates to semantically.

Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[
  {
    "targetIndex": 0,
    "relationshipType": "supports|opposes|addresses|explainer|compares_to|none",
    "reason": "Brief explanation in 10 words or less",
    "confidence": 0.85
  }
]

Rules:
- relationshipType: Choose the single best type. Use "none" if there is no meaningful connection.
- confidence: 0.0-1.0 based on how clearly the relationship exists.
- Only include items with confidence >= 0.6.
- targetIndex refers to the 0-based index in the EXISTING claims list.

Relationship types:
- supports: The new claim provides evidence or reasoning in favor of the existing claim.
- opposes: The new claim provides counter-evidence or reasoning against the existing claim.
- addresses: The new claim responds to or answers the existing claim.
- explainer: The new claim clarifies or breaks down the existing claim.
- compares_to: The new claim draws a parallel or contrast with the existing claim.

NEW claim:`

/**
 * Enrich a card with LLM-extracted entities, stance, topics, and summary.
 */
export async function enrichCardWithLLM(
  client: OpenAIClient,
  card: { id: string; title: string; content: string; cardType: string },
): Promise<LLMEnrichmentResult | null> {
  try {
    const text = card.content || card.title
    const response = await client.chatCompletion([
      { role: 'system', content: ENRICHMENT_PROMPT },
      { role: 'user', content: text },
    ])

    const parsed = parseJsonResponse(response) as Record<string, unknown> | null
    if (!parsed) return null

    const entities = Array.isArray(parsed.entities)
      ? parsed.entities.map((e: unknown) => {
          const ent = e as Record<string, unknown>
          return {
            type: String(ent.type ?? 'topic').toLowerCase(),
            value: String(ent.value ?? ''),
          }
        })
      : []
    const stance = ['pro', 'con', 'neutral'].includes(String(parsed.stance))
      ? (String(parsed.stance) as 'pro' | 'con' | 'neutral')
      : null
    const topics = Array.isArray(parsed.topics) ? parsed.topics.map(String) : []
    const summary = String(parsed.summary ?? '')

    return {
      entities,
      stance,
      topics,
      summary,
      tokensUsed: { prompt: 0, completion: 0 },
    }
  } catch (err) {
    return null
  }
}

/**
 * Infer semantic relationships between a new card and existing cards using LLM.
 */
export async function inferRelationshipsWithLLM(
  client: OpenAIClient,
  newCard: { id: string; title: string; content: string },
  existingCards: Array<{ id: string; title: string; content: string }>,
): Promise<LLMRelationshipSuggestion[]> {
  if (existingCards.length === 0) return []

  try {
    const existingText = existingCards
      .map(
        (c, i) =>
          `[${i}] ${c.title}${c.content ? ': ' + c.content.slice(0, 200) : ''}`,
      )
      .join('\n')

    const prompt = `${RELATIONSHIP_PROMPT}\n"${newCard.title}${newCard.content ? ' — ' + newCard.content.slice(0, 300) : ''}"\n\nEXISTING claims:\n${existingText}\n\nReturn JSON:`

    const response = await client.chatCompletion([
      {
        role: 'system',
        content: 'You analyze civic deliberation relationships.',
      },
      { role: 'user', content: prompt },
    ])

    const parsed = parseJsonResponse(response)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item: {
          targetIndex: number
          relationshipType: string
          confidence: number
        }) =>
          item.confidence >= 0.6 &&
          item.relationshipType !== 'none' &&
          existingCards[item.targetIndex],
      )
      .map(
        (item: {
          targetIndex: number
          relationshipType: string
          reason: string
          confidence: number
        }) => ({
          targetCardId: existingCards[item.targetIndex].id,
          relationshipType: item.relationshipType,
          reason: item.reason,
          confidence: item.confidence,
        }),
      )
  } catch {
    return []
  }
}

function parseJsonResponse(text: string): unknown {
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

/**
 * Persist LLM-enriched entities and generate suggestions.
 */
export async function processCardWithLLM(
  client: OpenAIClient,
  db: BridgeDatabase,
  card: {
    id: string
    title: string
    content: string
    cardType: string
    communityUri: string
  },
): Promise<void> {
  // Enrich the card
  const enrichment = await enrichCardWithLLM(client, card)
  if (enrichment) {
    for (const entity of enrichment.entities) {
      db.insertEntity({
        cardId: card.id,
        entityType: `llm:${entity.type}`,
        entityValue: entity.value,
      })
    }
  }

  // Get existing cards in same community for relationship inference
  const existingCards = db
    .getCardsForCommunity(card.communityUri, { limit: 20 })
    .filter((c: { id: string }) => c.id !== card.id)
    .map((c: { id: string; title: string; content: string }) => ({
      id: c.id,
      title: c.title,
      content: c.content ?? '',
    }))

  if (existingCards.length === 0) return

  // Infer relationships
  const suggestions = await inferRelationshipsWithLLM(
    client,
    card,
    existingCards,
  )

  for (const sugg of suggestions) {
    try {
      db.insertSuggestedRelationship({
        id: randomUUID(),
        sourceCardId: card.id,
        targetCardId: sugg.targetCardId,
        relationshipType: sugg.relationshipType,
        confidence: sugg.confidence,
        reason: `[LLM] ${sugg.reason}`,
      })
    } catch {
      // Duplicate suggestion — ignore
    }
  }
}
