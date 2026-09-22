---
title: com.para.civic.getOpenQuestionThread
description: Reference for the com.para.civic.getOpenQuestionThread lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get an open question thread with reply tree and vote tallies.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  | AT-URI of the open question post. | Format: `at-uri` |
| `depth` | `integer` | ❌  | How many levels of reply depth to include. | Min: 0<br/>Max: 1000<br/>Default: `6` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |
| `replies` | Array of [`#replyView`](#replyview) | ✅  |  |  |
**Possible Errors:**

- `NotFound`

---

<a name="replyview"></a>
### `replyView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `author` | `string` | ✅  |  | Format: `did` |
| `text` | `string` | ✅  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `voteScore` | `integer` | ✅  | Net vote score (upvotes - downvotes). |  |
| `viewerVote` | `integer` | ❌  | Current viewer's vote: -1, 0, or 1. | Min: -1<br/>Max: 1 |
| `replies` | Array of [`#replyView`](#replyview) | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.getOpenQuestionThread",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get an open question thread with reply tree and vote tallies.",
      "parameters": {
        "type": "params",
        "required": [
          "uri"
        ],
        "properties": {
          "uri": {
            "type": "string",
            "format": "at-uri",
            "description": "AT-URI of the open question post."
          },
          "depth": {
            "type": "integer",
            "default": 6,
            "minimum": 0,
            "maximum": 1000,
            "description": "How many levels of reply depth to include."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "post",
            "replies"
          ],
          "properties": {
            "post": {
              "type": "ref",
              "ref": "com.para.feed.getAuthorFeed#postView"
            },
            "replies": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#replyView"
              }
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        }
      ]
    },
    "replyView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "author",
        "text",
        "createdAt",
        "voteScore"
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
        "author": {
          "type": "string",
          "format": "did"
        },
        "text": {
          "type": "string",
          "maxLength": 3000,
          "maxGraphemes": 300
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "voteScore": {
          "type": "integer",
          "description": "Net vote score (upvotes - downvotes)."
        },
        "viewerVote": {
          "type": "integer",
          "minimum": -1,
          "maximum": 1,
          "description": "Current viewer's vote: -1, 0, or 1."
        },
        "replies": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#replyView"
          }
        }
      }
    }
  }
}
```
