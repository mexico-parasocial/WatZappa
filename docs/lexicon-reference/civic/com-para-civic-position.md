---
title: com.para.civic.position
description: Reference for the com.para.civic.position lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

User's structured debate stance on a Cabildeo.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `stance` | `string` | ✅  |  | Known Values: `for`, `against`, `amendment` |
| `optionIndex` | `integer` | ❌  |  | Min: 0 |
| `text` | `string` | ✅  |  | Max Length: 3000 |
| `compassQuadrant` | `string` | ❌  |  | Max Length: 100 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.position",
  "defs": {
    "main": {
      "type": "record",
      "description": "User's structured debate stance on a Cabildeo.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "cabildeo",
          "stance",
          "text",
          "createdAt"
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
          "optionIndex": {
            "type": "integer",
            "minimum": 0
          },
          "text": {
            "type": "string",
            "maxLength": 3000
          },
          "compassQuadrant": {
            "type": "string",
            "maxLength": 100
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
