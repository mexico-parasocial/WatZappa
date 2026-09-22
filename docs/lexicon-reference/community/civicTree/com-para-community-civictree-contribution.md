---
title: com.para.community.civicTree.contribution
description: Reference for the com.para.community.civicTree.contribution lexicon
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
| `sourceUri` | `string` | ❌  |  | Format: `at-uri` |
| `sourceUrl` | `string` | ❌  |  | Format: `uri` |
| `sourceType` | `string` | ✅  |  | Max Length: 64 |
| `metadata` | `string` | ❌  |  | Max Length: 20000 |
| `status` | `string` | ✅  |  | Known Values: `pending`, `approved`, `rejected` |
| `approvedCard` | `string` | ❌  |  | Format: `at-uri` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `decidedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.contribution",
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
          "sourceType",
          "status",
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
          "sourceUri": {
            "type": "string",
            "format": "at-uri"
          },
          "sourceUrl": {
            "type": "string",
            "format": "uri"
          },
          "sourceType": {
            "type": "string",
            "maxLength": 64
          },
          "metadata": {
            "type": "string",
            "maxLength": 20000
          },
          "status": {
            "type": "string",
            "knownValues": [
              "pending",
              "approved",
              "rejected"
            ]
          },
          "approvedCard": {
            "type": "string",
            "format": "at-uri"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          },
          "decidedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
