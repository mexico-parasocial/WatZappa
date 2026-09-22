---
title: com.para.raq.proposal
description: Reference for the com.para.raq.proposal lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A proposed RAQ question submitted by a community member for promotion to official or community axes.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `text` | `string` | ✅  | The proposed question text | Max Length: 1000 |
| `targetAxis` | `string` | ❌  | Optional target axis id this question relates to | Max Length: 64 |
| `targetCommunity` | `string` | ❌  | Optional target community name | Max Length: 128 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.proposal",
  "defs": {
    "main": {
      "type": "record",
      "description": "A proposed RAQ question submitted by a community member for promotion to official or community axes.",
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
            "maxLength": 1000,
            "description": "The proposed question text"
          },
          "targetAxis": {
            "type": "string",
            "maxLength": 64,
            "description": "Optional target axis id this question relates to"
          },
          "targetCommunity": {
            "type": "string",
            "maxLength": 128,
            "description": "Optional target community name"
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
