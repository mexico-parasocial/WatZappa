import type { BridgeDatabase } from './db.js'
import type { OpenAIClient } from './openai-client.js'

export interface DeliberationSummary {
  normalizedClaims: Array<{
    claim: string
    stance: 'support' | 'oppose' | 'unsure' | 'amendment' | 'needs_evidence'
    sourceType: string
    sourceId?: string
  }>
  tensionLines: Array<{
    axis: string
    summary: string
    sides: string[]
    relatedClaimIds?: string[]
  }>
  openQuestions: Array<{
    question: string
    whyItMatters: string
    relatedClaimIds?: string[]
  }>
  consensusAreas: Array<{ topic: string; claims: string[] }>
  unresolvedConflicts: Array<{ topic: string; opposingClaims: string[] }>
  bridgeStatements: string[]
  stanceDistribution: { pro: number; con: number; neutral: number }
  totalClaims: number
  totalRelationships: number
  generatedAt: string
}

const SUMMARIZE_PROMPT = `You are a civic deliberation analyst. Given a list of claims from a community discussion, produce a structured summary.

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "normalizedClaims": [
    {
      "claim": "Clear civic claim",
      "stance": "support | oppose | unsure | amendment | needs_evidence",
      "sourceType": "claim | question | article | link | book | research | audio | video | social | event",
      "sourceId": "card id if available"
    }
  ],
  "tensionLines": [
    {
      "axis": "cost vs access",
      "summary": "The concrete disagreement in one sentence",
      "sides": ["Side A", "Side B"],
      "relatedClaimIds": ["card id"]
    }
  ],
  "openQuestions": [
    {
      "question": "Unresolved question the community should answer",
      "whyItMatters": "Why this blocks better deliberation",
      "relatedClaimIds": ["card id"]
    }
  ],
  "consensusAreas": [
    {"topic": "Short topic name", "claims": ["Claim 1", "Claim 2"]}
  ],
  "unresolvedConflicts": [
    {"topic": "Short topic name", "opposingClaims": ["Pro claim", "Con claim"]}
  ],
  "bridgeStatements": ["A claim that both sides seem to accept"],
  "stanceDistribution": {"pro": 35, "con": 25, "neutral": 40}
}

Rules:
- normalizedClaims: Convert raw cards into crisp civic claims. Maximum 6 claims.
- stance must be one of: support, oppose, unsure, amendment, needs_evidence.
- tensionLines: Capture real disagreement structures, not generic sentiment. Prefer axes like cost vs access, privacy vs transparency, speed vs legitimacy, local residents vs outside actors, evidence-backed concern vs emotional objection. Maximum 4 tension lines.
- openQuestions: Questions that would unlock better civic action. Maximum 5 questions.
- consensusAreas: Groups of 2-4 claims where most participants seem to agree. Maximum 3 areas.
- unresolvedConflicts: Pairs of claims that represent genuine disagreement. Maximum 3 conflicts.
- bridgeStatements: Up to 3 claims that could unite otherwise divided participants.
- stanceDistribution: Estimated percentages of pro/con/neutral stances across all claims. Must sum to 100.
- Be concise. Each claim string max 80 characters.

Claims:`

export async function summarizeCommunityDeliberation(
  client: OpenAIClient,
  db: BridgeDatabase,
  communityUri: string,
): Promise<DeliberationSummary | null> {
  const cards = db.getCardsForCommunity(communityUri, { limit: 100 })
  if (cards.length === 0) return null

  const claimsText = cards
    .map(
      (c: { title: string; content: string; card_type: string }, i: number) =>
        `${i + 1}. [${c.card_type}] ${c.title}${c.content ? ': ' + c.content.slice(0, 150) : ''}`,
    )
    .join('\n')

  try {
    const response = await client.chatCompletion([
      { role: 'system', content: SUMMARIZE_PROMPT },
      { role: 'user', content: claimsText },
    ])

    const parsed = parseJsonResponse(response)
    if (!parsed) return null

    const rels = db.getGraphForCommunity(communityUri)

    const normalizedClaims = Array.isArray(parsed.normalizedClaims)
      ? parsed.normalizedClaims
          .map((c: unknown) => {
            const claim = c as Record<string, unknown>
            const stance = normalizeClaimStance(claim.stance)
            return {
              claim: String(claim.claim ?? '').slice(0, 180),
              stance,
              sourceType: String(claim.sourceType ?? 'claim'),
              sourceId: claim.sourceId ? String(claim.sourceId) : undefined,
            }
          })
          .filter((c) => c.claim.length > 0)
          .slice(0, 6)
      : buildFallbackClaims(cards)
    const tensionLines = Array.isArray(parsed.tensionLines)
      ? parsed.tensionLines
          .map((t: unknown) => {
            const tension = t as Record<string, unknown>
            return {
              axis: String(tension.axis ?? ''),
              summary: String(tension.summary ?? '').slice(0, 220),
              sides: Array.isArray(tension.sides)
                ? tension.sides.map(String).slice(0, 2)
                : [],
              relatedClaimIds: Array.isArray(tension.relatedClaimIds)
                ? tension.relatedClaimIds.map(String).slice(0, 6)
                : undefined,
            }
          })
          .filter((t) => t.axis.length > 0 && t.summary.length > 0)
          .slice(0, 4)
      : []
    const openQuestions = Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions
          .map((q: unknown) => {
            const question = q as Record<string, unknown>
            return {
              question: String(question.question ?? '').slice(0, 180),
              whyItMatters: String(question.whyItMatters ?? '').slice(0, 220),
              relatedClaimIds: Array.isArray(question.relatedClaimIds)
                ? question.relatedClaimIds.map(String).slice(0, 6)
                : undefined,
            }
          })
          .filter((q) => q.question.length > 0)
          .slice(0, 5)
      : buildFallbackOpenQuestions(cards)
    const consensusAreas = Array.isArray(parsed.consensusAreas)
      ? parsed.consensusAreas.map((a: unknown) => {
          const area = a as Record<string, unknown>
          return {
            topic: String(area.topic ?? ''),
            claims: Array.isArray(area.claims)
              ? area.claims.map(String).slice(0, 4)
              : [],
          }
        })
      : []
    const unresolvedConflicts = Array.isArray(parsed.unresolvedConflicts)
      ? parsed.unresolvedConflicts.map((c: unknown) => {
          const conflict = c as Record<string, unknown>
          return {
            topic: String(conflict.topic ?? ''),
            opposingClaims: Array.isArray(conflict.opposingClaims)
              ? conflict.opposingClaims.map(String).slice(0, 2)
              : [],
          }
        })
      : []
    const bridgeStatements = Array.isArray(parsed.bridgeStatements)
      ? parsed.bridgeStatements.map(String).slice(0, 3)
      : []
    const stanceDist = parsed.stanceDistribution as
      | Record<string, unknown>
      | undefined

    return {
      normalizedClaims,
      tensionLines,
      openQuestions,
      consensusAreas,
      unresolvedConflicts,
      bridgeStatements,
      stanceDistribution: {
        pro: Number(stanceDist?.pro ?? 33),
        con: Number(stanceDist?.con ?? 33),
        neutral: Number(stanceDist?.neutral ?? 34),
      },
      totalClaims: cards.length,
      totalRelationships: rels.edges.length,
      generatedAt: new Date().toISOString(),
    }
  } catch (err) {
    return null
  }
}

function normalizeClaimStance(
  value: unknown,
): DeliberationSummary['normalizedClaims'][number]['stance'] {
  const stance = String(value ?? '').toLowerCase()
  if (
    stance === 'support' ||
    stance === 'oppose' ||
    stance === 'unsure' ||
    stance === 'amendment' ||
    stance === 'needs_evidence'
  ) {
    return stance
  }
  return 'unsure'
}

function buildFallbackClaims(
  cards: Array<{ id?: string; title: string; card_type: string }>,
): DeliberationSummary['normalizedClaims'] {
  return cards.slice(0, 6).map((card) => ({
    claim: card.title,
    stance: card.card_type === 'question' ? 'needs_evidence' : 'unsure',
    sourceType: card.card_type || 'claim',
    sourceId: card.id,
  }))
}

function buildFallbackOpenQuestions(
  cards: Array<{ title: string; card_type: string }>,
): DeliberationSummary['openQuestions'] {
  const questions = cards
    .filter(
      (card) =>
        card.card_type === 'question' || card.title.trim().endsWith('?'),
    )
    .slice(0, 5)
    .map((card) => ({
      question: card.title.trim().endsWith('?') ? card.title : `${card.title}?`,
      whyItMatters:
        'This question needs an answer before the community can turn the map into shared action.',
    }))
  if (questions.length > 0) return questions
  return [
    {
      question:
        'What evidence would help the community evaluate the strongest claims?',
      whyItMatters:
        'Evidence gaps are where deliberation can become concrete instead of circular.',
    },
  ]
}

function parseJsonResponse(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, '').trim()
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    return null
  }
}
