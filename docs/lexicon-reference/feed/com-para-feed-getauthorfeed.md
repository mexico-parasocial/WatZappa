---
title: com.para.feed.getAuthorFeed
description: Reference for the com.para.feed.getAuthorFeed lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a paginated feed of Para posts authored by the given actor.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `actor` | `string` | ✅  | Handle or DID of the actor. | Format: `at-identifier` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
| `party` | `string` | ❌  |  | Max Length: 128 |
| `community` | `string` | ❌  |  | Max Length: 128 |
| `flairTag` | `string` | ❌  | Filter by an exact Para flair tag, e.g. |#Sanidad or ||#TransportePublico. | Max Length: 128 |
| `postType` | `string` | ❌  | Filter by post type, e.g. meme, proposal, debate. | Max Length: 64 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `feed` | Array of [`#postView`](#postview) | ✅  |  |  |
**Possible Errors:**

- `BlockedActor`
- `BlockedByActor`

---

<a name="postview"></a>
### `postView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `author` | `string` | ✅  |  | Format: `did` |
| `text` | `string` | ✅  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `replyRoot` | `string` | ❌  |  | Format: `at-uri` |
| `replyParent` | `string` | ❌  |  | Format: `at-uri` |
| `langs` | Array of `string` | ❌  |  | Max Items: 3 |
| `tags` | Array of `string` | ❌  |  | Max Items: 8 |
| `flairs` | Array of `string` | ❌  |  | Max Items: 8 |
| `postType` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.feed.getAuthorFeed",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a paginated feed of Para posts authored by the given actor.",
      "parameters": {
        "type": "params",
        "required": [
          "actor"
        ],
        "properties": {
          "actor": {
            "type": "string",
            "format": "at-identifier",
            "description": "Handle or DID of the actor."
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          },
          "party": {
            "type": "string",
            "maxLength": 128
          },
          "community": {
            "type": "string",
            "maxLength": 128
          },
          "flairTag": {
            "type": "string",
            "maxLength": 128,
            "description": "Filter by an exact Para flair tag, e.g. |#Sanidad or ||#TransportePublico."
          },
          "postType": {
            "type": "string",
            "maxLength": 64,
            "description": "Filter by post type, e.g. meme, proposal, debate."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "feed"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "feed": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#postView"
              }
            }
          }
        }
      },
      "errors": [
        {
          "name": "BlockedActor"
        },
        {
          "name": "BlockedByActor"
        }
      ]
    },
    "postView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "author",
        "text",
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
        "replyRoot": {
          "type": "string",
          "format": "at-uri"
        },
        "replyParent": {
          "type": "string",
          "format": "at-uri"
        },
        "langs": {
          "type": "array",
          "maxLength": 3,
          "items": {
            "type": "string",
            "format": "language"
          }
        },
        "tags": {
          "type": "array",
          "maxLength": 8,
          "items": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64
          }
        },
        "flairs": {
          "type": "array",
          "maxLength": 8,
          "items": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64
          }
        },
        "postType": {
          "type": "string",
          "maxLength": 64,
          "maxGraphemes": 64
        }
      }
    }
  }
}
```
