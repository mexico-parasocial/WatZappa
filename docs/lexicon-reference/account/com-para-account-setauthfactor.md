---
title: com.para.account.setAuthFactor
description: Reference for the com.para.account.setAuthFactor lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Set the two-factor authentication method for the account. Omit authFactorType to turn 2FA off. Currently only iM8 verification is supported through this endpoint.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `authFactorType` | `string` | ❌  | The 2FA method to require at login. Omit to turn 2FA off. | Known Values: `im8` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `authFactorType` | `string` | ❌  | The 2FA method now required at login. Absent when 2FA is off. | Known Values: `im8` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.account.setAuthFactor",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Set the two-factor authentication method for the account. Omit authFactorType to turn 2FA off. Currently only iM8 verification is supported through this endpoint.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "properties": {
            "authFactorType": {
              "type": "string",
              "knownValues": [
                "im8"
              ],
              "description": "The 2FA method to require at login. Omit to turn 2FA off."
            }
          }
        }
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
              "description": "The 2FA method now required at login. Absent when 2FA is off."
            }
          }
        }
      }
    }
  }
}
```
