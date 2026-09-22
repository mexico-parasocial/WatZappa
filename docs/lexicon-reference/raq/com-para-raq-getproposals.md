---
title: com.para.raq.getProposals
description: Reference for the com.para.raq.getProposals lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get proposed RAQ questions with vote and answer aggregations.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ❌  |  | Max Length: 128 |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `proposals` | Array of [`#proposalView`](#proposalview) | ✅  |  |  |

---

<a name="proposalview"></a>
### `proposalView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `creator` | `string` | ✅  |  | Format: `did` |
| `text` | `string` | ✅  |  | Max Length: 1000 |
| `targetAxis` | `string` | ❌  |  | Max Length: 64 |
| `targetCommunity` | `string` | ❌  |  | Max Length: 128 |
| `upvotes` | `integer` | ✅  |  |  |
| `downvotes` | `integer` | ✅  |  |  |
| `answerCount` | `integer` | ❌  |  |  |
| `answerAverage` | `integer` | ❌  |  |  |
| `viewerUpvote` | `boolean` | ❌  |  |  |
| `viewerDownvote` | `boolean` | ❌  |  |  |
| `viewerAnswer` | `integer` | ❌  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `indexedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.getProposals",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get proposed RAQ questions with vote and answer aggregations.",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "maxLength": 128
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
            "proposals"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "proposals": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#proposalView"
              }
            }
          }
        }
      }
    },
    "proposalView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "creator",
        "text",
        "upvotes",
        "downvotes",
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
        "text": {
          "type": "string",
          "maxLength": 1000
        },
        "targetAxis": {
          "type": "string",
          "maxLength": 64
        },
        "targetCommunity": {
          "type": "string",
          "maxLength": 128
        },
        "upvotes": {
          "type": "integer"
        },
        "downvotes": {
          "type": "integer"
        },
        "answerCount": {
          "type": "integer"
        },
        "answerAverage": {
          "type": "integer"
        },
        "viewerUpvote": {
          "type": "boolean"
        },
        "viewerDownvote": {
          "type": "boolean"
        },
        "viewerAnswer": {
          "type": "integer"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "indexedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
