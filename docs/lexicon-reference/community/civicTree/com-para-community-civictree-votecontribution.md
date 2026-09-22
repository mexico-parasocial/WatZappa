---
title: com.para.community.civicTree.voteContribution
description: Reference for the com.para.community.civicTree.voteContribution lexicon
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
| `voterDid` | `string` | ✅  |  | Format: `did` |
| `vote` | `string` | ✅  |  | Known Values: `approve`, `reject` |
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
  "id": "com.para.community.civicTree.voteContribution",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "contribution",
            "voterDid",
            "vote"
          ],
          "properties": {
            "contribution": {
              "type": "string"
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
