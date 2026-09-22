---
title: com.para.community.civicTree.cardVote
description: Reference for the com.para.community.civicTree.cardVote lexicon
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
| `card` | `string` | ✅  |  | Format: `at-uri` |
| `voterDid` | `string` | ✅  |  | Format: `did` |
| `influence` | `integer` | ✅  |  | Min: -3<br/>Max: 3 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.cardVote",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "card",
          "voterDid",
          "influence",
          "createdAt"
        ],
        "properties": {
          "card": {
            "type": "string",
            "format": "at-uri"
          },
          "voterDid": {
            "type": "string",
            "format": "did"
          },
          "influence": {
            "type": "integer",
            "minimum": -3,
            "maximum": 3
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
