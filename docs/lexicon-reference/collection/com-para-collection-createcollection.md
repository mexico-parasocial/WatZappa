---
title: com.para.collection.createCollection
description: Reference for the com.para.collection.createCollection lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Create a new policy collection.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `name` | `string` | ✅  |  | Max Length: 200 |
| `description` | `string` | ❌  |  | Max Length: 2000 |
| `color` | `string` | ❌  |  | Max Length: 7 |
**Output:**

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
  "id": "com.para.collection.createCollection",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Create a new policy collection.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "name"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 200
            },
            "description": {
              "type": "string",
              "maxLength": 2000
            },
            "color": {
              "type": "string",
              "maxLength": 7
            }
          }
        }
      },
      "output": {
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
