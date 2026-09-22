---
title: com.para.collection.deleteCollection
description: Reference for the com.para.collection.deleteCollection lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Delete a policy collection.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.collection.deleteCollection",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Delete a policy collection.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "id"
          ],
          "properties": {
            "id": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```
