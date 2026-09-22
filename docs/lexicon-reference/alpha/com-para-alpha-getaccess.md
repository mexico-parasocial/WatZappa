---
title: com.para.alpha.getAccess
description: Reference for the com.para.alpha.getAccess lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Check if the authenticated user has alpha access.

**Parameters:** _(None defined)_

**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `hasAccess` | `boolean` | ✅  |  |  |
| `state` | `string` | ❌  |  |  |
| `waitlistPosition` | `integer` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.alpha.getAccess",
  "defs": {
    "main": {
      "type": "query",
      "description": "Check if the authenticated user has alpha access.",
      "parameters": {
        "type": "params",
        "properties": {}
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "hasAccess"
          ],
          "properties": {
            "hasAccess": {
              "type": "boolean"
            },
            "state": {
              "type": "string"
            },
            "waitlistPosition": {
              "type": "integer"
            }
          }
        }
      }
    }
  }
}
```
