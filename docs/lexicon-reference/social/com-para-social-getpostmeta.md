---
title: com.para.social.getPostMeta
description: Reference for the com.para.social.getPostMeta lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get Para social metadata for a post.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#postMeta`](#postmeta)


**Possible Errors:**

- `NotFound`

---

<a name="postmeta"></a>
### `postMeta`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `postType` | `string` | ❌  |  | Enum: `policy`, `matter`, `meme` |
| `official` | `boolean` | ❌  |  |  |
| `party` | `string` | ❌  |  |  |
| `community` | `string` | ❌  |  |  |
| `category` | `string` | ❌  |  |  |
| `tags` | Array of `string` | ❌  |  |  |
| `flairs` | Array of `string` | ❌  |  |  |
| `voteScore` | `integer` | ✅  |  |  |
| `interactionMode` | `string` | ✅  |  | Enum: `policy_ballot`, `reddit_votes` |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.social.getPostMeta",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get Para social metadata for a post.",
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
          "type": "ref",
          "ref": "#postMeta"
        }
      },
      "errors": [
        {
          "name": "NotFound"
        }
      ]
    },
    "postMeta": {
      "type": "object",
      "required": [
        "uri",
        "interactionMode",
        "voteScore"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "postType": {
          "type": "string",
          "enum": [
            "policy",
            "matter",
            "meme"
          ]
        },
        "official": {
          "type": "boolean"
        },
        "party": {
          "type": "string"
        },
        "community": {
          "type": "string"
        },
        "category": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "flairs": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "voteScore": {
          "type": "integer"
        },
        "interactionMode": {
          "type": "string",
          "enum": [
            "policy_ballot",
            "reddit_votes"
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
