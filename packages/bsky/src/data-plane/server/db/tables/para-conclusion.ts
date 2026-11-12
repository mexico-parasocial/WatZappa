export const conclusionTableName = 'para_conclusion'

export interface ParaConclusion {
  uri: string
  cid: string
  creator: string
  cabildeo: string
  communityUri: string
  text: string
  /** JSON array of position URIs. */
  cited: string
  followUp: string | null
  edited: boolean
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [conclusionTableName]: ParaConclusion
}
