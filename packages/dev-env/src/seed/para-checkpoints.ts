export type ParaSeedCheckpointName =
  | 'users'
  | 'profiles'
  | 'graph'
  | 'verifications'
  | 'partyCommunities'
  | 'civicCommunities'
  | 'cabildeos'
  | 'positions'
  | 'votes'
  | 'delegations'
  | 'posts'
  | 'engagement'
  | 'highlights'
  | 'liveSessions'
  | 'lists'
  | 'postMeta'
  | 'raq'

export type ParaSeedCheckpoint = {
  name: ParaSeedCheckpointName
  completedAt: string
  durationMs: number
}

export class ParaSeedCheckpointRunner {
  private checkpoints: ParaSeedCheckpoint[] = []

  constructor(private network: { processAll(): Promise<void> }) {}

  async run<T>(
    name: ParaSeedCheckpointName,
    task: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now()
    const result = await task()
    await this.network.processAll()
    this.checkpoints.push({
      name,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    })
    return result
  }

  async flush(name: ParaSeedCheckpointName): Promise<void> {
    await this.run(name, async () => undefined)
  }

  summary(): {
    checkpointCount: number
    checkpoints: ParaSeedCheckpoint[]
  } {
    return {
      checkpointCount: this.checkpoints.length,
      checkpoints: [...this.checkpoints],
    }
  }
}
