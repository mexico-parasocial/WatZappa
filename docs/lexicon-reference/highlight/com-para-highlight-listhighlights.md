---
title: com.para.highlight.listHighlights
description: Reference for the com.para.highlight.listHighlights lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

List indexed public highlight annotations with optional filters.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ❌  |  | Max Length: 100 |
| `state` | `string` | ❌  |  | Max Length: 100 |
| `subject` | `string` | ❌  |  | Format: `at-uri` |
| `creator` | `string` | ❌  |  | Format: `did` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `30` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `highlights` | Array of [`com.para.highlight.defs#highlightView`]([[com-para-highlight-defs|com.para.highlight.defs#highlightView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.highlight.listHighlights",
  "defs": {
    "main": {
      "type": "query",
      "description": "List indexed public highlight annotations with optional filters.",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "maxLength": 100
          },
          "state": {
            "type": "string",
            "maxLength": 100
          },
          "subject": {
            "type": "string",
            "format": "at-uri"
          },
          "creator": {
            "type": "string",
            "format": "did"
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
            "highlights"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "highlights": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.highlight.defs#highlightView"
              }
            }
          }
        }
      }
    }
  }
}
```
