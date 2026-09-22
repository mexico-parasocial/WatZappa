---
title: com.para.feed.getTimeline
description: Reference for the com.para.feed.getTimeline lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a paginated timeline of Para posts authored by accounts the viewer follows, plus the viewer's own posts.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
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
| `feed` | Array of [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.feed.getTimeline",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a paginated timeline of Para posts authored by accounts the viewer follows, plus the viewer's own posts.",
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
                "ref": "com.para.feed.getAuthorFeed#postView"
              }
            }
          }
        }
      }
    }
  }
}
```
