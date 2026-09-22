---
title: com.para.civic.listCabildeoPositions
description: Reference for the com.para.civic.listCabildeoPositions lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

List indexed positions for a Cabildeo with optional stance filter.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `stance` | `string` | ❌  |  | Known Values: `for`, `against`, `amendment` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `positions` | Array of [`com.para.civic.defs#positionView`]([[com-para-civic-defs|com.para.civic.defs#positionView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.listCabildeoPositions",
  "defs": {
    "main": {
      "type": "query",
      "description": "List indexed positions for a Cabildeo with optional stance filter.",
      "parameters": {
        "type": "params",
        "required": [
          "cabildeo"
        ],
        "properties": {
          "cabildeo": {
            "type": "string",
            "format": "at-uri"
          },
          "stance": {
            "type": "string",
            "knownValues": [
              "for",
              "against",
              "amendment"
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
          "type": "object",
          "required": [
            "positions"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "positions": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.civic.defs#positionView"
              }
            }
          }
        }
      }
    }
  }
}
```
