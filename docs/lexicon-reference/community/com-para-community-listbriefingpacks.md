---
title: com.para.community.listBriefingPacks
description: Reference for the com.para.community.listBriefingPacks lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ❌  |  | Format: `at-uri` |
| `party` | `string` | ❌  |  |  |
| `cabildeo` | `string` | ❌  |  | Format: `at-uri` |
| `civicTreeCard` | `string` | ❌  |  |  |
| `status` | `string` | ❌  |  | Enum: `draft`, `published`, `archived` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100 |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `packs` | Array of [`com.para.community.defs#briefingPackView`]([[com-para-community-defs|com.para.community.defs#briefingPackView]]) | ✅  |  |  |
| `cursor` | `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listBriefingPacks",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "party": {
            "type": "string"
          },
          "cabildeo": {
            "type": "string",
            "format": "at-uri"
          },
          "civicTreeCard": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "draft",
              "published",
              "archived"
            ]
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
            "packs"
          ],
          "properties": {
            "packs": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.community.defs#briefingPackView"
              }
            },
            "cursor": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```
