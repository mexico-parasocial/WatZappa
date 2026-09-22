---
title: com.para.community.civicTree.contributionVote
description: Reference for the com.para.community.civicTree.contributionVote lexicon
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
| `contribution` | `string` | ✅  |  | Format: `at-uri` |
| `voterDid` | `string` | ✅  |  | Format: `did` |
| `vote` | `string` | ✅  |  | Known Values: `approve`, `reject` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.contributionVote",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "contribution",
          "voterDid",
          "vote",
          "createdAt"
        ],
        "properties": {
          "contribution": {
            "type": "string",
            "format": "at-uri"
          },
          "voterDid": {
            "type": "string",
            "format": "did"
          },
          "vote": {
            "type": "string",
            "knownValues": [
              "approve",
              "reject"
            ]
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
