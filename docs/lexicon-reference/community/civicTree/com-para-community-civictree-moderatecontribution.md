---
title: com.para.community.civicTree.moderateContribution
description: Reference for the com.para.community.civicTree.moderateContribution lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `contribution` | `string` | ✅  |  |  |
| `moderatorDid` | `string` | ✅  |  | Format: `did` |
| `decision` | `string` | ✅  |  | Known Values: `approve`, `reject` |
| `reason` | `string` | ❌  |  | Max Length: 1000 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `contribution` | [`com.para.community.civicTree.defs#contributionView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#contributionView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.moderateContribution",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "contribution",
            "moderatorDid",
            "decision"
          ],
          "properties": {
            "contribution": {
              "type": "string"
            },
            "moderatorDid": {
              "type": "string",
              "format": "did"
            },
            "decision": {
              "type": "string",
              "knownValues": [
                "approve",
                "reject"
              ]
            },
            "reason": {
              "type": "string",
              "maxLength": 1000
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "contribution"
          ],
          "properties": {
            "contribution": {
              "type": "ref",
              "ref": "com.para.community.civicTree.defs#contributionView"
            }
          }
        }
      }
    }
  }
}
```
