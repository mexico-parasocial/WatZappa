---
title: com.para.civic.delegation
description: Reference for the com.para.civic.delegation lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Standing liquid-democracy cession of civic voting power.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ❌  |  | Format: `at-uri` |
| `mode` | `string` | ❌  |  | Known Values: `active`, `passive` |
| `delegateTo` | `string` | ❌  |  | Format: `did` |
| `party` | `string` | ❌  |  | Max Length: 100 |
| `community` | `string` | ❌  |  | Max Length: 100 |
| `scopeFlairs` | Array of `string` | ❌  |  | Max Items: 10 |
| `preferredOption` | `integer` | ❌  |  | Min: 0 |
| `signal` | `integer` | ❌  |  | Min: -3<br/>Max: 3 |
| `reason` | `string` | ❌  |  | Max Length: 1000 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.delegation",
  "defs": {
    "main": {
      "type": "record",
      "description": "Standing liquid-democracy cession of civic voting power.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "createdAt"
        ],
        "properties": {
          "cabildeo": {
            "type": "string",
            "format": "at-uri"
          },
          "mode": {
            "type": "string",
            "knownValues": [
              "active",
              "passive"
            ]
          },
          "delegateTo": {
            "type": "string",
            "format": "did"
          },
          "party": {
            "type": "string",
            "maxLength": 100
          },
          "community": {
            "type": "string",
            "maxLength": 100
          },
          "scopeFlairs": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 100
            },
            "maxLength": 10
          },
          "preferredOption": {
            "type": "integer",
            "minimum": 0
          },
          "signal": {
            "type": "integer",
            "minimum": -3,
            "maximum": 3
          },
          "reason": {
            "type": "string",
            "maxLength": 1000
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
