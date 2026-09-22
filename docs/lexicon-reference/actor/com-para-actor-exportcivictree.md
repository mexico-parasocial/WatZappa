---
title: com.para.actor.exportCivicTree
description: Reference for the com.para.actor.exportCivicTree lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Export the authenticated user's own civic tree as an Obsidian vault. A civic tree may only be exported by its owner.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `actor` | `string` | ❌  | DID of the actor to export. Must be the authenticated viewer; defaults to them. | Format: `did` |
| `includeVotes` | `boolean` | ❌  | Include the actor's cast votes. Defaults to true. |  |
| `includeDelegations` | `boolean` | ❌  | Include the actor's liquid-democracy delegations. Defaults to true. |  |
| `includeHighlights` | `boolean` | ❌  | Include the actor's public compass highlights. Defaults to true. |  |
| `includeCommunities` | `boolean` | ❌  | Include communities the actor is a member of. Defaults to true. |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `generatedAt` | `string` | ✅  |  | Format: `datetime` |
| `files` | Array of [`com.para.community.defs#obsidianFileView`]([[com-para-community-defs|com.para.community.defs#obsidianFileView]]) | ✅  |  |  |
| `summary` | [`#summary`](#summary) | ❌  |  |  |
**Possible Errors:**

- `Forbidden`: The requested actor is not the authenticated viewer.

---

<a name="summary"></a>
### `summary`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityCount` | `integer` | ✅  |  |  |
| `cabildeoCount` | `integer` | ✅  |  |  |
| `voteCount` | `integer` | ✅  |  |  |
| `delegationCount` | `integer` | ✅  |  |  |
| `highlightCount` | `integer` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.actor.exportCivicTree",
  "defs": {
    "main": {
      "type": "query",
      "description": "Export the authenticated user's own civic tree as an Obsidian vault. A civic tree may only be exported by its owner.",
      "parameters": {
        "type": "params",
        "properties": {
          "actor": {
            "type": "string",
            "format": "did",
            "description": "DID of the actor to export. Must be the authenticated viewer; defaults to them."
          },
          "includeVotes": {
            "type": "boolean",
            "description": "Include the actor's cast votes. Defaults to true."
          },
          "includeDelegations": {
            "type": "boolean",
            "description": "Include the actor's liquid-democracy delegations. Defaults to true."
          },
          "includeHighlights": {
            "type": "boolean",
            "description": "Include the actor's public compass highlights. Defaults to true."
          },
          "includeCommunities": {
            "type": "boolean",
            "description": "Include communities the actor is a member of. Defaults to true."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "generatedAt",
            "files"
          ],
          "properties": {
            "generatedAt": {
              "type": "string",
              "format": "datetime"
            },
            "files": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.community.defs#obsidianFileView"
              }
            },
            "summary": {
              "type": "ref",
              "ref": "#summary"
            }
          }
        }
      },
      "errors": [
        {
          "name": "Forbidden",
          "description": "The requested actor is not the authenticated viewer."
        }
      ]
    },
    "summary": {
      "type": "object",
      "required": [
        "communityCount",
        "cabildeoCount",
        "voteCount",
        "delegationCount",
        "highlightCount"
      ],
      "properties": {
        "communityCount": {
          "type": "integer"
        },
        "cabildeoCount": {
          "type": "integer"
        },
        "voteCount": {
          "type": "integer"
        },
        "delegationCount": {
          "type": "integer"
        },
        "highlightCount": {
          "type": "integer"
        }
      }
    }
  }
}
```
