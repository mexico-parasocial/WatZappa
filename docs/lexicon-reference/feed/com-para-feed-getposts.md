---
title: com.para.feed.getPosts
description: Reference for the com.para.feed.getPosts lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get Para post views for a specified list of post AT-URIs.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uris` | Array of `string` | ✅  | List of Para post AT-URIs to return. | Max Items: 25 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `posts` | Array of [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.feed.getPosts",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get Para post views for a specified list of post AT-URIs.",
      "parameters": {
        "type": "params",
        "required": [
          "uris"
        ],
        "properties": {
          "uris": {
            "type": "array",
            "description": "List of Para post AT-URIs to return.",
            "items": {
              "type": "string",
              "format": "at-uri"
            },
            "maxLength": 25
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "posts"
          ],
          "properties": {
            "posts": {
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
