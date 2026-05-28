export interface Collection {
  creator: string
  key: string
  createdAt: string
  updatedAt: string
  payload: string
}

export const tableName = 'collection'

export type PartialDB = { [tableName]: Collection }
