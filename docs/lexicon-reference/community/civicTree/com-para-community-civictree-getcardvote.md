---
title: com.para.community.civicTree.getCardVote
description: Reference for the com.para.community.civicTree.getCardVote lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `card` | `string` | ✅  |  |  |
| `voter` | `string` | ✅  |  | Format: `did` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `vote` | [`com.para.community.civicTree.defs#cardVoteView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#cardVoteView]]) | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.getCardVote",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "card",
          "voter"
        ],
        "properties": {
          "card": {
            "type": "string"
          },
          "voter": {
            "type": "string",
            "format": "did"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "properties": {
            "vote": {
              "type": "ref",
              "ref": "com.para.community.civicTree.defs#cardVoteView"
            }
          }
        }
      }
    }
  }
}
```
