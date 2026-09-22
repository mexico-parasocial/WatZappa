---
title: com.para.feed.getPostThread
description: Reference for the com.para.feed.getPostThread lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a Para post thread around a post URI.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  | Reference (AT-URI) to the post record. | Format: `at-uri` |
| `depth` | `integer` | ❌  | How many levels of reply depth to include. | Min: 0<br/>Max: 1000<br/>Default: `6` |
| `parentHeight` | `integer` | ❌  | How many levels of parent posts to include. | Min: 0<br/>Max: 1000<br/>Default: `80` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |
| `parents` | Array of [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |
| `replies` | Array of [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |
**Possible Errors:**

- `NotFound`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.feed.getPostThread",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a Para post thread around a post URI.",
      "parameters": {
        "type": "params",
        "required": [
          "uri"
        ],
        "properties": {
          "uri": {
            "type": "string",
            "format": "at-uri",
            "description": "Reference (AT-URI) to the post record."
          },
          "depth": {
            "type": "integer",
            "description": "How many levels of reply depth to include.",
            "default": 6,
            "minimum": 0,
            "maximum": 1000
          },
          "parentHeight": {
            "type": "integer",
            "description": "How many levels of parent posts to include.",
            "default": 80,
            "minimum": 0,
            "maximum": 1000
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "post",
            "parents",
            "replies"
          ],
          "properties": {
            "post": {
              "type": "ref",
              "ref": "com.para.feed.getAuthorFeed#postView"
            },
            "parents": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.feed.getAuthorFeed#postView"
              }
            },
            "replies": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.feed.getAuthorFeed#postView"
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
    }
  }
}
```
