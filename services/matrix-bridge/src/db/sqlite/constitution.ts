import { InfraArea } from './infra.js'

export class ConstitutionArea extends InfraArea {
  // Constitutions
  setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO community_constitution (community_uri, version, rules_json, created_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(communityUri, version, rulesJson)
  }

  getConstitution(communityUri: string):
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_constitution WHERE community_uri = ?')
      .get(communityUri) as
      | {
          community_uri: string
          version: number
          rules_json: string
          created_at: string
        }
      | undefined
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
