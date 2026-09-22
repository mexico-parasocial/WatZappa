---
title: com.para.community.civicTree.listContributions
description: Reference for the com.para.community.civicTree.listContributions lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `status` | `string` | ❌  |  | Known Values: `pending`, `approved`, `rejected` |
| `viewer` | `string` | ❌  |  | Format: `did` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100 |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `contributions` | Array of [`com.para.community.civicTree.defs#contributionView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#contributionView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.listContributions",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "community"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "status": {
            "type": "string",
            "knownValues": [
              "pending",
              "approved",
              "rejected"
            ]
          },
          "viewer": {
            "type": "string",
            "format": "did"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "contributions"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "contributions": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.community.civicTree.defs#contributionView"
              }
            }
          }
        }
      }
    }
  }
}
```
