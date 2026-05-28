import { removeStopwords, spa } from 'stopword'
import naturalModule from 'natural'
import keywordExtractorModule from 'keyword-extractor'

const natural =
  (naturalModule as typeof naturalModule & { default?: typeof naturalModule })
    .default ?? naturalModule
const { PorterStemmerEs, SentimentAnalyzer, RegexpTokenizer: WordTokenizer } = natural

const keywordExtractor = ((m) => m.default ?? m)(keywordExtractorModule)

// Spanish Sentiment Lexicon (Simplified for Civic Discourse)
const SpanishCivicLexicon = {
  // Positive / Trust
  acuerdo: 2,
  consenso: 3,
  transparencia: 2,
  progreso: 2,
  beneficio: 1,
  mejorar: 1,
  justicia: 2,
  equidad: 2,
  participación: 1,
  diálogo: 2,
  unión: 1,
  solución: 2,
  derechos: 1,
  libertad: 1,
  democracia: 2,
  voto: 1,
  propuesta: 1,

  // Negative / Anger / Fear
  corrupción: -3,
  fraude: -3,
  violencia: -3,
  inseguridad: -2,
  pobreza: -2,
  crisis: -2,
  inflación: -2,
  impunidad: -3,
  desigualdad: -2,
  conflicto: -2,
  protesta: -1,
  caos: -2,
  mentira: -2,
  robo: -3,
  abuso: -3,
  censura: -2,
  peligro: -2,
  miedo: -2,
  amenaza: -3,

  // Uncertainty
  duda: -1,
  incertidumbre: -1,
  quizás: -0.5,
  talvez: -0.5,
  posiblemente: -0.5,
  riesgo: -1,
}

export type SentimentResult = {
  label: 'anger' | 'fear' | 'trust' | 'uncertainty' | 'neutral'
  score: number
  comparative: number
}

const analyzer = new SentimentAnalyzer('Spanish', PorterStemmerEs, 'afinn') // Use built-in lexicon as base
// @ts-ignore: natural types are sometimes restrictive for custom lexicons
const customAnalyzer: any = analyzer
customAnalyzer.vocabulary = SpanishCivicLexicon // Inject custom civic lexicon
const tokenizer = new WordTokenizer({ pattern: /[^a-zA-ZáéíóúÁÉÍÓÚñÑ]+/ })

export function analyzeDiscourse(text: string): {
  sentiment: SentimentResult
  keywords: string[]
  constructiveness: number
} {
  const tokens = tokenizer.tokenize(text.toLowerCase())
  const filteredTokens = removeStopwords(tokens, spa)

  // 1. Sentiment Analysis
  const score = analyzer.getSentiment(tokens)
  const absScore = Math.abs(score)

  let label: SentimentResult['label'] = 'neutral'
  if (score > 0.5) label = 'trust'
  else if (score < -1.5) label = 'anger'
  else if (score < -0.5) label = 'fear'
  else if (
    tokens.some((t) =>
      ['duda', 'incertidumbre', 'riesgo', 'posible'].includes(t),
    )
  )
    label = 'uncertainty'

  // 2. Keyword Extraction
  const keywords = keywordExtractor
    .extract(text, {
      language: 'spanish',
      remove_digits: true,
      return_changed_case: true,
      remove_duplicates: true,
    })
    .slice(0, 10)

  // 3. Heuristic Constructiveness (Draft)
  // Higher score for longer text with more diverse vocabulary and less profanity/anger
  const diversity = new Set(filteredTokens).size / (filteredTokens.length || 1)
  const lengthBonus = Math.min(text.length / 500, 0.5)
  let constructiveness = diversity * 0.5 + lengthBonus

  if (label === 'anger') constructiveness -= 0.3
  if (text.includes('?')) constructiveness += 0.1 // Questions often provoke deliberation

  return {
    sentiment: {
      label,
      score: absScore,
      comparative: score,
    },
    keywords,
    constructiveness: Math.max(0, Math.min(1, constructiveness)),
  }
}
