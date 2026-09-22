---
title: com.para.collection.updateCollection
description: Reference for the com.para.collection.updateCollection lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Update an existing policy collection.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `collection` | [`com.para.collection.defs#collection`]([[com-para-collection-defs|com.para.collection.defs#collection]]) | ✅  |  |  |
**Possible Errors:**

- `NotFound`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.collection.updateCollection",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Update an existing policy collection.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "id",
            "collection"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "collection": {
              "type": "ref",
              "ref": "com.para.collection.defs#collection"
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
