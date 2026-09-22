---
title: com.para.community.civicTree.config
description: Reference for the com.para.community.civicTree.config lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

**Record Key:** `literal:self`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `governanceMode` | `string` | ✅  |  | Known Values: `votes_sortition`, `moderator_gate` |
| `approvalsRequired` | `integer` | ✅  |  | Min: 1 |
| `approvalMarginRequired` | `integer` | ✅  |  | Min: 0 |
| `moderatorGateEnabled` | `boolean` | ❌  |  |  |
| `sortitionEnabled` | `boolean` | ❌  |  |  |
| `updatedAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.config",
  "defs": {
    "main": {
      "type": "record",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": [
          "communityUri",
          "governanceMode",
          "approvalsRequired",
          "approvalMarginRequired",
          "updatedAt"
        ],
        "properties": {
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "governanceMode": {
            "type": "string",
            "knownValues": [
              "votes_sortition",
              "moderator_gate"
            ]
          },
          "approvalsRequired": {
            "type": "integer",
            "minimum": 1
          },
          "approvalMarginRequired": {
            "type": "integer",
            "minimum": 0
          },
          "moderatorGateEnabled": {
            "type": "boolean"
          },
          "sortitionEnabled": {
            "type": "boolean"
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
