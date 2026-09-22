---
title: com.para.community.createBoard
description: Reference for the com.para.community.createBoard lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Creates a PARA community board. Automatically instantiates the underlying general (270) and subdelegate (30) chats in the bsky chat server. Generates a founder starter pack draft.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `name` | `string` | ✅  |  | Min Length: 1<br/>Max Length: 1280<br/>Max Graphemes: 128 |
| `quadrant` | `string` | ✅  |  | Max Length: 64 |
| `description` | `string` | ❌  |  | Max Length: 3000 |
| `founderStarterPackName` | `string` | ❌  | User-provided name for the internal starter pack tracking founding members. If absent, a default name will be generated. | Max Length: 3000 |
| `governanceMode` | `string` | ❌  | Governance model for this community. Hierarchical uses owner/moderator roles. Horizontal uses rotating facilitators and assembly votes. Defaults to hierarchical. | Known Values: `hierarchical`, `horizontal` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `delegatesChatId` | `string` | ✅  |  |  |
| `subdelegatesChatId` | `string` | ✅  |  |  |
| `founderStarterPackUri` | `string` | ❌  | Reference to the newly created founder starter pack. Present if status is draft. | Format: `at-uri` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.createBoard",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Creates a PARA community board. Automatically instantiates the underlying general (270) and subdelegate (30) chats in the bsky chat server. Generates a founder starter pack draft.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "name",
            "quadrant"
          ],
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1,
              "maxGraphemes": 128,
              "maxLength": 1280
            },
            "quadrant": {
              "type": "string",
              "maxLength": 64
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "founderStarterPackName": {
              "type": "string",
              "maxLength": 3000,
              "description": "User-provided name for the internal starter pack tracking founding members. If absent, a default name will be generated."
            },
            "governanceMode": {
              "type": "string",
              "knownValues": [
                "hierarchical",
                "horizontal"
              ],
              "description": "Governance model for this community. Hierarchical uses owner/moderator roles. Horizontal uses rotating facilitators and assembly votes. Defaults to hierarchical."
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "uri",
            "cid",
            "delegatesChatId",
            "subdelegatesChatId"
          ],
          "properties": {
            "uri": {
              "type": "string",
              "format": "at-uri"
            },
            "cid": {
              "type": "string",
              "format": "cid"
            },
            "delegatesChatId": {
              "type": "string"
            },
            "subdelegatesChatId": {
              "type": "string"
            },
            "founderStarterPackUri": {
              "type": "string",
              "format": "at-uri",
              "description": "Reference to the newly created founder starter pack. Present if status is draft."
            }
          }
        }
      }
    }
  }
}
```
