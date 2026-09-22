---
title: com.para.notification.putPostSubscription
description: Reference for the com.para.notification.putPostSubscription lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Enable or disable notification subscriptions for a post. Requires auth.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
| `reply` | `boolean` | ✅  |  |  |
| `quote` | `boolean` | ✅  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
| `reply` | `boolean` | ✅  |  |  |
| `quote` | `boolean` | ✅  |  |  |
| `indexedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.notification.putPostSubscription",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Enable or disable notification subscriptions for a post. Requires auth.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "post",
            "reply",
            "quote"
          ],
          "properties": {
            "post": {
              "type": "string",
              "format": "at-uri"
            },
            "reply": {
              "type": "boolean"
            },
            "quote": {
              "type": "boolean"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "post",
            "reply",
            "quote"
          ],
          "properties": {
            "post": {
              "type": "string",
              "format": "at-uri"
            },
            "reply": {
              "type": "boolean"
            },
            "quote": {
              "type": "boolean"
            },
            "indexedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  }
}
```
