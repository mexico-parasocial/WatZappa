---
title: com.para.collection.getCollection
description: Reference for the com.para.collection.getCollection lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a single policy collection by ID.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `collection` | [`com.para.collection.defs#collectionView`]([[com-para-collection-defs|com.para.collection.defs#collectionView]]) | ✅  |  |  |
**Possible Errors:**

- `NotFound`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.collection.getCollection",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a single policy collection by ID.",
      "parameters": {
        "type": "params",
        "required": [
          "id"
        ],
        "properties": {
          "id": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "collection"
          ],
          "properties": {
            "collection": {
              "type": "ref",
              "ref": "com.para.collection.defs#collectionView"
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
