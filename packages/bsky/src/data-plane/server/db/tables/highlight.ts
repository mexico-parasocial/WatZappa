import { GeneratedAlways } from 'kysely'

export const annotationTableName = 'highlight_annotation'

export interface HighlightAnnotation {
  uri: string
  cid: string
  creator: string
  subjectUri: string
  subjectCid: string | null
  text: string
  start: number
  end: number
  color: string
  tag: string | null
  community: string | null
  state: string | null
  party: string | null
  visibility: string
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [annotationTableName]: HighlightAnnotation
}
