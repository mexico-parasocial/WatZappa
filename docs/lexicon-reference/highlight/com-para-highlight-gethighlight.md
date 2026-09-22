---
title: com.para.highlight.getHighlight
description: Reference for the com.para.highlight.getHighlight lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a single indexed highlight annotation by URI.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `highlight` | `string` | ✅  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `highlight` | [`com.para.highlight.defs#highlightView`]([[com-para-highlight-defs|com.para.highlight.defs#highlightView]]) | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.highlight.getHighlight",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a single indexed highlight annotation by URI.",
      "parameters": {
        "type": "params",
        "required": [
          "highlight"
        ],
        "properties": {
          "highlight": {
            "type": "string",
            "format": "at-uri"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "properties": {
            "highlight": {
              "type": "ref",
              "ref": "com.para.highlight.defs#highlightView"
            }
          }
        }
      }
    }
  }
}
```
