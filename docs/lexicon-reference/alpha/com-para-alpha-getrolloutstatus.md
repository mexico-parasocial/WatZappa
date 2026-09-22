---
title: com.para.alpha.getRolloutStatus
description: Reference for the com.para.alpha.getRolloutStatus lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get alpha rollout status per state. Admin-only endpoint.

**Parameters:** _(None defined)_

**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `states` | Array of [`#stateStatus`](#statestatus) | ✅  |  |  |

---

<a name="statestatus"></a>
### `stateStatus`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `state` | `string` | ✅  |  |  |
| `totalSlots` | `integer` | ✅  |  |  |
| `usedSlots` | `integer` | ✅  |  |  |
| `isOpen` | `boolean` | ✅  |  |  |
| `openedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.alpha.getRolloutStatus",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get alpha rollout status per state. Admin-only endpoint.",
      "parameters": {
        "type": "params",
        "properties": {}
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "states"
          ],
          "properties": {
            "states": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#stateStatus"
              }
            }
          }
        }
      }
    },
    "stateStatus": {
      "type": "object",
      "required": [
        "state",
        "totalSlots",
        "usedSlots",
        "isOpen"
      ],
      "properties": {
        "state": {
          "type": "string"
        },
        "totalSlots": {
          "type": "integer"
        },
        "usedSlots": {
          "type": "integer"
        },
        "isOpen": {
          "type": "boolean"
        },
        "openedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
