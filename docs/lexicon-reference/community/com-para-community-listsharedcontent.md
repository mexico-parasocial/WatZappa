---
title: com.para.community.listSharedContent
description: Reference for the com.para.community.listSharedContent lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists content shared into a PARA community, optionally including child community shares and removed shares for stewards.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `contentType` | `string` | ❌  |  | Known Values: `post`, `cabildeo`, `collection`, `mapInitiative`, `external` |
| `includeRemoved` | `boolean` | ❌  |  | Default: `false` |
| `includeChildren` | `boolean` | ❌  |  | Default: `false` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `items` | Array of [`com.para.community.defs#sharedContentView`]([[com-para-community-defs|com.para.community.defs#sharedContentView]]) | ✅  |  |  |
| `cursor` | `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listSharedContent",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists content shared into a PARA community, optionally including child community shares and removed shares for stewards.",
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
          "contentType": {
            "type": "string",
            "knownValues": [
              "post",
              "cabildeo",
              "collection",
              "mapInitiative",
              "external"
            ]
          },
          "includeRemoved": {
            "type": "boolean",
            "default": false
          },
          "includeChildren": {
            "type": "boolean",
            "default": false
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
          "ref": "#output"
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "items"
      ],
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.defs#sharedContentView"
          }
        },
        "cursor": {
          "type": "string"
        }
      }
    }
  }
}
```
