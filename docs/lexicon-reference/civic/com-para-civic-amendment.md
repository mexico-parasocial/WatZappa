---
title: com.para.civic.amendment
description: Reference for the com.para.civic.amendment lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

An inline amendment proposing a specific text replacement in a Cabildeo.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  | The AT-URI of the Cabildeo being amended. | Format: `at-uri` |
| `start` | `integer` | ✅  | Start index in the original text. | Min: 0 |
| `end` | `integer` | ✅  | End index in the original text. | Min: 0 |
| `originalText` | `string` | ✅  | The exact substring being replaced. | Max Length: 1000 |
| `replacementText` | `string` | ✅  | The proposed replacement text. | Max Length: 1000 |
| `justification` | `string` | ❌  | Rationale for the amendment. | Max Length: 5000 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.amendment",
  "defs": {
    "main": {
      "type": "record",
      "description": "An inline amendment proposing a specific text replacement in a Cabildeo.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "subject",
          "start",
          "end",
          "originalText",
          "replacementText",
          "createdAt"
        ],
        "properties": {
          "subject": {
            "type": "string",
            "format": "at-uri",
            "description": "The AT-URI of the Cabildeo being amended."
          },
          "start": {
            "type": "integer",
            "minimum": 0,
            "description": "Start index in the original text."
          },
          "end": {
            "type": "integer",
            "minimum": 0,
            "description": "End index in the original text."
          },
          "originalText": {
            "type": "string",
            "maxLength": 1000,
            "description": "The exact substring being replaced."
          },
          "replacementText": {
            "type": "string",
            "maxLength": 1000,
            "description": "The proposed replacement text."
          },
          "justification": {
            "type": "string",
            "maxLength": 5000,
            "description": "Rationale for the amendment."
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
