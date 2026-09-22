---
title: com.para.feed.searchPosts
description: Reference for the com.para.feed.searchPosts lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Find Para posts matching search criteria.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `q` | `string` | ✅  |  |  |
| `sort` | `string` | ❌  |  | Known Values: `top`, `latest`<br/>Default: `latest` |
| `since` | `string` | ❌  |  |  |
| `until` | `string` | ❌  |  |  |
| `mentions` | `string` | ❌  |  | Format: `at-identifier` |
| `author` | `string` | ❌  |  | Format: `at-identifier` |
| `lang` | `string` | ❌  |  | Format: `language` |
| `domain` | `string` | ❌  |  |  |
| `url` | `string` | ❌  |  | Format: `uri` |
| `tag` | Array of `string` | ❌  |  |  |
| `limit` | `integer` | ❌  |  | Default: `25` |
| `cursor` | `string` | ❌  |  |  |
| `communityUris` | Array of `string` | ❌  |  |  |
| `cabildeoUris` | Array of `string` | ❌  |  |  |
| `politicalCompassPositions` | Array of `string` | ❌  |  |  |
| `postType` | `string` | ❌  |  | Max Length: 64 |
| `flairs` | Array of `string` | ❌  |  |  |
| `party` | `string` | ❌  |  | Max Length: 128 |
| `verifiedPublicFigure` | `boolean` | ❌  |  |  |
| `state` | `string` | ❌  |  | Max Length: 128 |
| `districtKey` | `string` | ❌  |  | Max Length: 128 |
| `cabildeoPhase` | `string` | ❌  |  | Max Length: 64 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `hitsTotal` | `integer` | ❌  |  |  |
| `posts` | Array of [`com.para.feed.getAuthorFeed#postView`]([[com-para-feed-getauthorfeed|com.para.feed.getAuthorFeed#postView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.feed.searchPosts",
  "defs": {
    "main": {
      "type": "query",
      "description": "Find Para posts matching search criteria.",
      "parameters": {
        "type": "params",
        "required": [
          "q"
        ],
        "properties": {
          "q": {
            "type": "string"
          },
          "sort": {
            "type": "string",
            "knownValues": [
              "top",
              "latest"
            ],
            "default": "latest"
          },
          "since": {
            "type": "string"
          },
          "until": {
            "type": "string"
          },
          "mentions": {
            "type": "string",
            "format": "at-identifier"
          },
          "author": {
            "type": "string",
            "format": "at-identifier"
          },
          "lang": {
            "type": "string",
            "format": "language"
          },
          "domain": {
            "type": "string"
          },
          "url": {
            "type": "string",
            "format": "uri"
          },
          "tag": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "limit": {
            "type": "integer",
            "default": 25
          },
          "cursor": {
            "type": "string"
          },
          "communityUris": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "at-uri"
            }
          },
          "cabildeoUris": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "at-uri"
            }
          },
          "politicalCompassPositions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "postType": {
            "type": "string",
            "maxLength": 64
          },
          "flairs": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 128
            }
          },
          "party": {
            "type": "string",
            "maxLength": 128
          },
          "verifiedPublicFigure": {
            "type": "boolean"
          },
          "state": {
            "type": "string",
            "maxLength": 128
          },
          "districtKey": {
            "type": "string",
            "maxLength": 128
          },
          "cabildeoPhase": {
            "type": "string",
            "maxLength": 64
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
            "cursor": {
              "type": "string"
            },
            "hitsTotal": {
              "type": "integer"
            },
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
