---
title: com.para.community.proposal
description: Reference for the com.para.community.proposal lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `title` | `string` | ✅  |  | Max Length: 200 |
| `body` | `string` | ✅  |  | Max Length: 10000 |
| `author` | `string` | ✅  |  | Format: `did` |
| `type` | `string` | ❌  |  | Enum: `general`, `budget`, `amendment`, `moderation`<br/>Default: `general` |
| `budgetRequest` | `string` | ❌  | If type=budget, amount requested |  |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.proposal",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "community",
          "title",
          "body",
          "author"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "title": {
            "type": "string",
            "maxLength": 200
          },
          "body": {
            "type": "string",
            "maxLength": 10000
          },
          "author": {
            "type": "string",
            "format": "did"
          },
          "type": {
            "type": "string",
            "enum": [
              "general",
              "budget",
              "amendment",
              "moderation"
            ],
            "default": "general"
          },
          "budgetRequest": {
            "type": "string",
            "description": "If type=budget, amount requested"
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
