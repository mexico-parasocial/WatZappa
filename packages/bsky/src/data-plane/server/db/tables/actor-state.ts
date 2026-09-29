export interface ActorState {
  did: string
  lastSeenNotifs: string
  lastSeenPriorityNotifs: string | undefined
}

export const tableName = 'actor_state'

export type PartialDB = { [tableName]: ActorState }
