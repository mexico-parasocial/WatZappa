---
title: com.para.community.listCommunityRelations
description: Reference for the com.para.community.listCommunityRelations lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists parent-child relation records touching a community.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ❌  |  | Format: `at-uri` |
| `parentCommunityUri` | `string` | ❌  |  | Format: `at-uri` |
| `childCommunityUri` | `string` | ❌  |  | Format: `at-uri` |
| `relation` | `string` | ❌  |  | Known Values: `parentChild` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `relations` | Array of [`com.para.community.defs#communityRelationView`]([[com-para-community-defs|com.para.community.defs#communityRelationView]]) | ✅  |  |  |
| `cursor` | `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listCommunityRelations",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists parent-child relation records touching a community.",
      "parameters": {
        "type": "params",
        "properties": {
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "parentCommunityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "childCommunityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "relation": {
            "type": "string",
            "knownValues": [
              "parentChild"
            ]
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "#output"
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "relations"
      ],
      "properties": {
        "relations": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.defs#communityRelationView"
          }
        },
        "cursor": {
          "type": "string"
        }
      }
    }
  }
}
```
