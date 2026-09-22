---
title: com.para.community.relation
description: Reference for the com.para.community.relation lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A member or steward-authored relation between two PARA community boards.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `parentCommunityUri` | `string` | ✅  |  | Format: `at-uri` |
| `childCommunityUri` | `string` | ✅  |  | Format: `at-uri` |
| `relation` | `string` | ✅  |  | Known Values: `parentChild` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.relation",
  "defs": {
    "main": {
      "type": "record",
      "description": "A member or steward-authored relation between two PARA community boards.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "parentCommunityUri",
          "childCommunityUri",
          "relation",
          "createdAt"
        ],
        "properties": {
          "parentCommunityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "childCommunityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "relation": {
            "type": "string",
            "knownValues": [
              "parentChild"
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
