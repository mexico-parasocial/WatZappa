---
title: com.para.community.civicTree
description: Reference for the com.para.community.civicTree lexicon
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
| `proposal` | `string` | ✅  | URI of the proposal being deliberated on | Format: `at-uri` |
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `author` | `string` | ✅  |  | Format: `did` |
| `body` | `string` | ✅  | Short statement for civicTree, like a Polis comment | Max Length: 500 |
| `stance` | `string` | ❌  | Author's self-reported stance. Bridging = attempts to find common ground. | Enum: `for`, `against`, `neutral`, `bridging` |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "proposal",
          "community",
          "author",
          "body"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri",
            "description": "URI of the proposal being deliberated on"
          },
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "author": {
            "type": "string",
            "format": "did"
          },
          "body": {
            "type": "string",
            "maxLength": 500,
            "description": "Short statement for civicTree, like a Polis comment"
          },
          "stance": {
            "type": "string",
            "enum": [
              "for",
              "against",
              "neutral",
              "bridging"
            ],
            "description": "Author's self-reported stance. Bridging = attempts to find common ground."
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
