---
title: com.para.actor.getSuggestedUsers
description: Reference for the com.para.actor.getSuggestedUsers lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get suggested PARA users ranked by civic relevance: shared community memberships, compass proximity, recent PARA-flair usage, and follower popularity. Returns the same profileView shape as app.bsky.actor.getProfile so callers can drop in.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `category` | `string` | ❌  | Civic pillar to bias the suggestions toward. Authors who have recently posted under this pillar's sub-tags will rank higher. | Known Values: `public-services`, `internal-revenue`, `economy`, `social-issues`, `external-affairs`, `internal-affairs` |
| `interests` | Array of `string` | ❌  | Optional list of sub-tag interest keys (e.g. 'healthcare', 'minimum-wage'). When provided, authors with matching post tags are boosted. |  |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `25` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `actors` | Array of [`app.bsky.actor.defs#profileView`](https://github.com/bluesky-social/atproto/tree/main/lexicons/app/bsky/actor/defs.json#profileView) | ✅  |  |  |
| `recId` | `string` | ❌  |  |  |
| `cursor` | `string` | ❌  |  |  |
**Possible Errors:**

- `NotFound`
- `BlockedActor`
- `BlockedByActor`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.actor.getSuggestedUsers",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get suggested PARA users ranked by civic relevance: shared community memberships, compass proximity, recent PARA-flair usage, and follower popularity. Returns the same profileView shape as app.bsky.actor.getProfile so callers can drop in.",
      "parameters": {
        "type": "params",
        "properties": {
          "category": {
            "type": "string",
            "knownValues": [
              "public-services",
              "internal-revenue",
              "economy",
              "social-issues",
              "external-affairs",
              "internal-affairs"
            ],
            "description": "Civic pillar to bias the suggestions toward. Authors who have recently posted under this pillar's sub-tags will rank higher."
          },
          "interests": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Optional list of sub-tag interest keys (e.g. 'healthcare', 'minimum-wage'). When provided, authors with matching post tags are boosted."
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 25
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
            "actors"
          ],
          "properties": {
            "actors": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "app.bsky.actor.defs#profileView"
              }
            },
            "recId": {
              "type": "string"
            },
            "cursor": {
              "type": "string"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        },
        {
          "name": "BlockedActor"
        },
        {
          "name": "BlockedByActor"
        }
      ]
    }
  }
}
```
