---
title: com.para.civic.putLivePresence
description: Reference for the com.para.civic.putLivePresence lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Create, refresh, or clear the caller's live cabildeo presence. Requires auth.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `sessionId` | `string` | ✅  |  | Max Length: 128<br/>Max Graphemes: 128 |
| `present` | `boolean` | ❌  |  | Default: `true` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `present` | `boolean` | ✅  |  |  |
| `expiresAt` | `string` | ❌  |  | Format: `datetime` |
**Possible Errors:**

- `NotFound`: The target cabildeo does not exist.
- `InvalidPhase`: The target cabildeo is not currently eligible for live participation.
- `LiveStatusRequired`: A host must already have an active live status with an external destination.

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.putLivePresence",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Create, refresh, or clear the caller's live cabildeo presence. Requires auth.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "cabildeo",
            "sessionId"
          ],
          "properties": {
            "cabildeo": {
              "type": "string",
              "format": "at-uri"
            },
            "sessionId": {
              "type": "string",
              "maxLength": 128,
              "maxGraphemes": 128
            },
            "present": {
              "type": "boolean",
              "default": true
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "cabildeo",
            "present"
          ],
          "properties": {
            "cabildeo": {
              "type": "string",
              "format": "at-uri"
            },
            "present": {
              "type": "boolean"
            },
            "expiresAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound",
          "description": "The target cabildeo does not exist."
        },
        {
          "name": "InvalidPhase",
          "description": "The target cabildeo is not currently eligible for live participation."
        },
        {
          "name": "LiveStatusRequired",
          "description": "A host must already have an active live status with an external destination."
        }
      ]
    }
  }
}
```
