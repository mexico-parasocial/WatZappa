---
title: com.para.community.civicTree.castCardVote
description: Reference for the com.para.community.civicTree.castCardVote lexicon
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
| `card` | `string` | ✅  |  |  |
| `voterDid` | `string` | ✅  |  | Format: `did` |
| `influence` | `integer` | ✅  |  | Min: -3<br/>Max: 3 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `success` | `boolean` | ✅  |  |  |
| `totalInfluence` | `integer` | ❌  |  |  |
| `voteCount` | `integer` | ❌  |  | Min: 0 |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.castCardVote",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "card",
            "voterDid",
            "influence"
          ],
          "properties": {
            "card": {
              "type": "string"
            },
            "voterDid": {
              "type": "string",
              "format": "did"
            },
            "influence": {
              "type": "integer",
              "minimum": -3,
              "maximum": 3
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "success"
          ],
          "properties": {
            "success": {
              "type": "boolean"
            },
            "totalInfluence": {
              "type": "integer"
            },
            "voteCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      }
    }
  }
}
```
