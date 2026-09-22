---
title: com.para.community.civicTree.card
description: Reference for the com.para.community.civicTree.card lexicon
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
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `authorDid` | `string` | ✅  |  | Format: `did` |
| `title` | `string` | ✅  |  | Max Length: 500 |
| `content` | `string` | ❌  |  | Max Length: 10000 |
| `cardType` | `string` | ✅  |  | Max Length: 64 |
| `stance` | `string` | ❌  |  | Known Values: `pro`, `con`, `neutral` |
| `compassQuadrant` | `string` | ❌  |  | Max Length: 64 |
| `sourceUri` | `string` | ❌  |  | Format: `at-uri` |
| `sourceUrl` | `string` | ❌  |  | Format: `uri` |
| `metadata` | `string` | ❌  |  | Max Length: 20000 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `updatedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.card",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "communityUri",
          "authorDid",
          "title",
          "cardType",
          "createdAt"
        ],
        "properties": {
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "authorDid": {
            "type": "string",
            "format": "did"
          },
          "title": {
            "type": "string",
            "maxLength": 500
          },
          "content": {
            "type": "string",
            "maxLength": 10000
          },
          "cardType": {
            "type": "string",
            "maxLength": 64
          },
          "stance": {
            "type": "string",
            "knownValues": [
              "pro",
              "con",
              "neutral"
            ]
          },
          "compassQuadrant": {
            "type": "string",
            "maxLength": 64
          },
          "sourceUri": {
            "type": "string",
            "format": "at-uri"
          },
          "sourceUrl": {
            "type": "string",
            "format": "uri"
          },
          "metadata": {
            "type": "string",
            "maxLength": 20000
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          },
          "updatedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
