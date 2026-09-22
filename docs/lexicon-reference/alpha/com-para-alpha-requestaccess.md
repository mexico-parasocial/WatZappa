---
title: com.para.alpha.requestAccess
description: Reference for the com.para.alpha.requestAccess lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Request alpha access for a given state. Optionally provide an invite code to skip the waitlist.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `state` | `string` | ✅  | Mexican state abbreviation or name | Min Length: 1<br/>Max Length: 64 |
| `inviteCode` | `string` | ❌  | Optional invite code in format STATE-XXXX-XXXX | Min Length: 1<br/>Max Length: 64 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `status` | `string` | ✅  |  | Known Values: `approved`, `waitlisted`, `rejected`, `already_has_access` |
| `position` | `integer` | ❌  |  |  |
| `state` | `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.alpha.requestAccess",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Request alpha access for a given state. Optionally provide an invite code to skip the waitlist.",
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
              "maxLength": 64,
              "description": "Mexican state abbreviation or name"
            },
            "inviteCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64,
              "description": "Optional invite code in format STATE-XXXX-XXXX"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "status"
          ],
          "properties": {
            "status": {
              "type": "string",
              "knownValues": [
                "approved",
                "waitlisted",
                "rejected",
                "already_has_access"
              ]
            },
            "position": {
              "type": "integer"
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
