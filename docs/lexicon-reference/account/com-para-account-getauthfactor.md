---
title: com.para.account.getAuthFactor
description: Reference for the com.para.account.getAuthFactor lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get the two-factor authentication method currently required for the account. Absent when 2FA is off.

**Parameters:** _(None defined)_

**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `authFactorType` | `string` | ❌  | The 2FA method required at login. Absent when 2FA is off. | Known Values: `im8` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.account.getAuthFactor",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get the two-factor authentication method currently required for the account. Absent when 2FA is off.",
      "parameters": {
        "type": "params",
        "properties": {}
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "properties": {
            "authFactorType": {
              "type": "string",
              "knownValues": [
                "im8"
              ],
              "description": "The 2FA method required at login. Absent when 2FA is off."
            }
          }
        }
      }
    }
  }
}
```
