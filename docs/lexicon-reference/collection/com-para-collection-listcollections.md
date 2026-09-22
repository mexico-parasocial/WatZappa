---
title: com.para.collection.listCollections
description: Reference for the com.para.collection.listCollections lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

List policy collections for the authenticated user.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `collections` | Array of [`com.para.collection.defs#collectionView`]([[com-para-collection-defs|com.para.collection.defs#collectionView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.collection.listCollections",
  "defs": {
    "main": {
      "type": "query",
      "description": "List policy collections for the authenticated user.",
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
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "collections"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "collections": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.collection.defs#collectionView"
              }
            }
          }
        }
      }
    }
  }
}
```
