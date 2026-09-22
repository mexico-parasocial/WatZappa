---
title: com.para.notification.getPostSubscription
description: Reference for the com.para.notification.getPostSubscription lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get the requesting viewer's notification subscription for a post.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
| `reply` | `boolean` | ✅  |  |  |
| `quote` | `boolean` | ✅  |  |  |
| `indexedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.notification.getPostSubscription",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get the requesting viewer's notification subscription for a post.",
      "parameters": {
        "type": "params",
        "required": [
          "post"
        ],
        "properties": {
          "post": {
            "type": "string",
            "format": "at-uri"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "post",
            "reply",
            "quote"
          ],
          "properties": {
            "post": {
              "type": "string",
              "format": "at-uri"
            },
            "reply": {
              "type": "boolean"
            },
            "quote": {
              "type": "boolean"
            },
            "indexedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  }
}
```
