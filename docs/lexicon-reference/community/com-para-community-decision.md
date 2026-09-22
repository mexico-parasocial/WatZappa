---
title: com.para.community.decision
description: Reference for the com.para.community.decision lexicon
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
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `result` | `string` | ✅  |  | Enum: `approved`, `rejected`, `tied`, `quorum_not_met` |
| `votesFor` | `integer` | ✅  |  |  |
| `votesAgainst` | `integer` | ✅  |  |  |
| `votesAbstain` | `integer` | ✅  |  |  |
| `totalMembers` | `integer` | ❌  | Total eligible voters at time of decision |  |
| `quorumRequired` | `string` | ❌  |  |  |
| `thresholdRequired` | `string` | ❌  |  |  |
| `constitutionVersion` | `integer` | ❌  |  |  |
| `budgetAllocated` | `string` | ❌  | If budget proposal, amount approved |  |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.decision",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "proposal",
          "community",
          "result",
          "votesFor",
          "votesAgainst",
          "votesAbstain"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri"
          },
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "result": {
            "type": "string",
            "enum": [
              "approved",
              "rejected",
              "tied",
              "quorum_not_met"
            ]
          },
          "votesFor": {
            "type": "integer"
          },
          "votesAgainst": {
            "type": "integer"
          },
          "votesAbstain": {
            "type": "integer"
          },
          "totalMembers": {
            "type": "integer",
            "description": "Total eligible voters at time of decision"
          },
          "quorumRequired": {
            "type": "string"
          },
          "thresholdRequired": {
            "type": "string"
          },
          "constitutionVersion": {
            "type": "integer"
          },
          "budgetAllocated": {
            "type": "string",
            "description": "If budget proposal, amount approved"
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
