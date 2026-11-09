import { InfraArea } from './infra.js'

export class ConstitutionArea extends InfraArea {
  // Constitutions
  async setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO community_constitution (community_uri, version, rules_json, created_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (community_uri) DO UPDATE SET version = EXCLUDED.version, rules_json = EXCLUDED.rules_json, created_at = EXCLUDED.created_at`,
      [communityUri, version, rulesJson],
    )
  }

  async getConstitution(communityUri: string): Promise<
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined
  > {
    const row = await this.queryOne<{
      community_uri: string
      version: number
      rules_json: string
      created_at: string
    }>('SELECT * FROM community_constitution WHERE community_uri = $1', [
      communityUri,
    ])
    return row
      ? {
          communityUri: row.community_uri,
          version: row.version,
          rulesJson: row.rules_json,
          createdAt: row.created_at,
        }
      : undefined
  }
}
