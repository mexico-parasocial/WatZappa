---
title: com.para.civic.listCabildeos
description: Reference for the com.para.civic.listCabildeos lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

List indexed Cabildeos with aggregate summaries and optional viewer context.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ❌  | Optional community filter. | Max Length: 100 |
| `phase` | `string` | ❌  | Optional phase filter. | Known Values: `draft`, `open`, `deliberating`, `voting`, `resolved` |
| `query` | `string` | ❌  | Optional search query |  |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `30` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `cabildeos` | Array of [`com.para.civic.defs#cabildeoView`]([[com-para-civic-defs|com.para.civic.defs#cabildeoView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.listCabildeos",
  "defs": {
    "main": {
      "type": "query",
      "description": "List indexed Cabildeos with aggregate summaries and optional viewer context.",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "maxLength": 100,
            "description": "Optional community filter."
          },
          "phase": {
            "type": "string",
            "knownValues": [
              "draft",
              "open",
              "deliberating",
              "voting",
              "resolved"
            ],
            "description": "Optional phase filter."
          },
          "query": {
            "type": "string",
            "description": "Optional search query"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 30
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
            "cabildeos"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "cabildeos": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.civic.defs#cabildeoView"
              }
            }
          }
        }
      }
    }
  }
}
```
