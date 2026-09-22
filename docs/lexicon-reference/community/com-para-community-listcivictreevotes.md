---
title: com.para.community.listCivicTreeVotes
description: Reference for the com.para.community.listCivicTreeVotes lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `statement` | `string` | ✅  |  | Format: `at-uri` |
| `direction` | `string` | ❌  |  | Enum: `agree`, `disagree`, `pass` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `votes` | Array of [`#voteView`](#voteview) | ✅  |  |  |

---

<a name="voteview"></a>
### `voteView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `statement` | `string` | ✅  |  | Format: `at-uri` |
| `voter` | `string` | ✅  |  | Format: `did` |
| `direction` | `string` | ✅  |  | Enum: `agree`, `disagree`, `pass` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listCivicTreeVotes",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "statement"
        ],
        "properties": {
          "statement": {
            "type": "string",
            "format": "at-uri"
          },
          "direction": {
            "type": "string",
            "enum": [
              "agree",
              "disagree",
              "pass"
            ]
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "votes"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "votes": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#voteView"
              }
            }
          }
        }
      }
    },
    "voteView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "statement",
        "voter",
        "direction",
        "createdAt"
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
        "statement": {
          "type": "string",
          "format": "at-uri"
        },
        "voter": {
          "type": "string",
          "format": "did"
        },
        "direction": {
          "type": "string",
          "enum": [
            "agree",
            "disagree",
            "pass"
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
```
