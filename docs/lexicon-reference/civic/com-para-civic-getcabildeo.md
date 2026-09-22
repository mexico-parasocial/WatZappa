---
title: com.para.civic.getCabildeo
description: Reference for the com.para.civic.getCabildeo lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a single indexed Cabildeo by URI, including aggregate and viewer context fields.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | [`com.para.civic.defs#cabildeoView`]([[com-para-civic-defs|com.para.civic.defs#cabildeoView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.getCabildeo",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a single indexed Cabildeo by URI, including aggregate and viewer context fields.",
      "parameters": {
        "type": "params",
        "required": [
          "cabildeo"
        ],
        "properties": {
          "cabildeo": {
            "type": "string",
            "format": "at-uri"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "cabildeo"
          ],
          "properties": {
            "cabildeo": {
              "type": "ref",
              "ref": "com.para.civic.defs#cabildeoView"
            }
          }
        }
      }
    }
  }
}
```
