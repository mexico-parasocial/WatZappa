---
title: com.para.community.listVotes
description: Reference for the com.para.community.listVotes lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
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
| `creator` | `string` | ✅  |  | Format: `did` |
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `signal` | `integer` | ✅  |  | Min: -3<br/>Max: 3 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listVotes",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "proposal"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri"
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
        "creator",
        "proposal",
        "community",
        "signal",
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
        "creator": {
          "type": "string",
          "format": "did"
        },
        "proposal": {
          "type": "string",
          "format": "at-uri"
        },
        "community": {
          "type": "string",
          "format": "at-uri"
        },
        "signal": {
          "type": "integer",
          "minimum": -3,
          "maximum": 3
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
