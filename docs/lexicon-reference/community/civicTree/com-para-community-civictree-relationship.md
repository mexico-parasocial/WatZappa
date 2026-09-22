---
title: com.para.community.civicTree.relationship
description: Reference for the com.para.community.civicTree.relationship lexicon
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
| `sourceCard` | `string` | ✅  |  | Format: `at-uri` |
| `targetCard` | `string` | ✅  |  | Format: `at-uri` |
| `relationshipType` | `string` | ✅  |  | Max Length: 64 |
| `authorDid` | `string` | ✅  |  | Format: `did` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.relationship",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "communityUri",
          "sourceCard",
          "targetCard",
          "relationshipType",
          "authorDid",
          "createdAt"
        ],
        "properties": {
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "sourceCard": {
            "type": "string",
            "format": "at-uri"
          },
          "targetCard": {
            "type": "string",
            "format": "at-uri"
          },
          "relationshipType": {
            "type": "string",
            "maxLength": 64
          },
          "authorDid": {
            "type": "string",
            "format": "did"
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
