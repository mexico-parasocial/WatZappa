---
title: com.para.community.listParentCommunities
description: Reference for the com.para.community.listParentCommunities lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists parent communities for a child community.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`com.para.community.listCommunityRelations#output`]([[com-para-community-listcommunityrelations|com.para.community.listCommunityRelations#output]])



---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listParentCommunities",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists parent communities for a child community.",
      "parameters": {
        "type": "params",
        "required": [
          "communityUri"
        ],
        "properties": {
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "com.para.community.listCommunityRelations#output"
        }
      }
    }
  }
}
```
