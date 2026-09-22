---
title: com.para.status
description: Reference for the com.para.status lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Current public status for a Para account.

**Record Key:** `literal:self`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `status` | `string` | ✅  | User's public status message. | Max Length: 300<br/>Max Graphemes: 300 |
| `party` | `string` | ❌  | Optional political party affiliation. | Max Length: 64<br/>Max Graphemes: 64 |
| `community` | `string` | ❌  | Optional primary community label. | Max Length: 64<br/>Max Graphemes: 64 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.status",
  "defs": {
    "main": {
      "type": "record",
      "description": "Current public status for a Para account.",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": [
          "status",
          "createdAt"
        ],
        "properties": {
          "status": {
            "type": "string",
            "maxLength": 300,
            "maxGraphemes": 300,
            "description": "User's public status message."
          },
          "party": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64,
            "description": "Optional political party affiliation."
          },
          "community": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64,
            "description": "Optional primary community label."
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
