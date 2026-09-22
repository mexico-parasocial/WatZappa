---
title: com.para.feed.getMemes
description: Reference for the com.para.feed.getMemes lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a paginated feed of Para memes with fully hydrated media embeds.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
| `party` | `string` | ❌  |  | Max Length: 128 |
| `community` | `string` | ❌  |  | Max Length: 128 |
| `state` | `string` | ❌  |  | Max Length: 128 |
| `category` | `string` | ❌  |  | Max Length: 128 |
| `flairTag` | `string` | ❌  | Filter by an exact Para flair tag. | Max Length: 128 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `feed` | Array of [`#memeView`](#memeview) | ✅  |  |  |

---

<a name="memeview"></a>
### `memeView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | [`app.bsky.feed.defs#postView`](https://github.com/bluesky-social/atproto/tree/main/lexicons/app/bsky/feed/defs.json#postView) | ✅  |  |  |
| `meta` | [`com.para.social.getPostMeta#postMeta`]([[com-para-social-getpostmeta|com.para.social.getPostMeta#postMeta]]) | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.feed.getMemes",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a paginated feed of Para memes with fully hydrated media embeds.",
      "parameters": {
        "type": "params",
        "properties": {
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
          "state": {
            "type": "string",
            "maxLength": 128
          },
          "category": {
            "type": "string",
            "maxLength": 128
          },
          "flairTag": {
            "type": "string",
            "maxLength": 128,
            "description": "Filter by an exact Para flair tag."
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
                "ref": "#memeView"
              }
            }
          }
        }
      }
    },
    "memeView": {
      "type": "object",
      "required": [
        "post"
      ],
      "properties": {
        "post": {
          "type": "ref",
          "ref": "app.bsky.feed.defs#postView"
        },
        "meta": {
          "type": "ref",
          "ref": "com.para.social.getPostMeta#postMeta"
        }
      }
    }
  }
}
```
