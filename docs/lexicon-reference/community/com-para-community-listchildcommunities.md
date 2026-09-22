---
title: com.para.community.listChildCommunities
description: Reference for the com.para.community.listChildCommunities lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists child communities for a parent community.

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
  "id": "com.para.community.listChildCommunities",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists child communities for a parent community.",
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
