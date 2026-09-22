---
title: com.para.alpha.createInvite
description: Reference for the com.para.alpha.createInvite lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Generate invite codes for a specific state. Admin-only.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `state` | `string` | ✅  |  | Min Length: 1<br/>Max Length: 64 |
| `count` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `1` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `codes` | Array of `string` | ✅  |  |  |
| `state` | `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.alpha.createInvite",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Generate invite codes for a specific state. Admin-only.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "state"
          ],
          "properties": {
            "state": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "count": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 1
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "codes",
            "state"
          ],
          "properties": {
            "codes": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "state": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```
