---
title: com.para.civic.openQuestion
description: Reference for the com.para.civic.openQuestion lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

An open question post — a community question designed for structured replies and voting.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `text` | `string` | ✅  | The question text. | Max Length: 3000<br/>Max Graphemes: 300 |
| `community` | `string` | ❌  | Optional community this question is posted to. | Max Length: 100 |
| `tags` | Array of `string` | ❌  |  | Max Items: 8 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.openQuestion",
  "defs": {
    "main": {
      "type": "record",
      "description": "An open question post — a community question designed for structured replies and voting.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "text",
          "createdAt"
        ],
        "properties": {
          "text": {
            "type": "string",
            "maxLength": 3000,
            "maxGraphemes": 300,
            "description": "The question text."
          },
          "community": {
            "type": "string",
            "maxLength": 100,
            "description": "Optional community this question is posted to."
          },
          "tags": {
            "type": "array",
            "maxLength": 8,
            "items": {
              "type": "string",
              "maxLength": 64,
              "maxGraphemes": 64
            }
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
