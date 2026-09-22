---
title: com.para.community.constitution
description: Reference for the com.para.community.constitution lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `version` | `integer` | ✅  | Constitution version, incremented on each amendment |  |
| `rules` | [`#rules`](#rules) | ✅  |  |  |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

<a name="rules"></a>
### `rules`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `quorum` | `string` | ❌  | Fraction of members required for quorum (0.0 - 1.0) |  |
| `approvalThreshold` | `string` | ❌  | Fraction of votes required to approve (0.0 - 1.0) |  |
| `deliberationDays` | `integer` | ❌  | Minimum days of deliberation before voting | Min: 1 |
| `votingDays` | `integer` | ❌  | Days voting remains open | Min: 1 |
| `chamberSize` | `integer` | ❌  | Max members per chamber | Min: 1 |
| `observerSize` | `integer` | ❌  | Max observer council size | Min: 1 |
| `autoModeration` | [`#autoModeration`](#automoderation) | ❌  |  |  |
| `budget` | [`#budget`](#budget) | ❌  |  |  |

---

<a name="automoderation"></a>
### `autoModeration`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `enabled` | `boolean` | ❌  |  |  |
| `spamThreshold` | `integer` | ❌  | Max identical messages per hour |  |
| `toxicityThreshold` | `string` | ❌  | ML toxicity score threshold (0.0 - 1.0) |  |

---

<a name="budget"></a>
### `budget`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `enabled` | `boolean` | ❌  |  |  |
| `matchingPool` | `string` | ❌  | Total matching funds available |  |
| `minContribution` | `string` | ❌  | Minimum individual contribution |  |
| `roundDurationDays` | `integer` | ❌  | Duration of each quadratic funding round |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.constitution",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "community",
          "version",
          "rules"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "version": {
            "type": "integer",
            "description": "Constitution version, incremented on each amendment"
          },
          "rules": {
            "type": "ref",
            "ref": "#rules"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    },
    "rules": {
      "type": "object",
      "properties": {
        "quorum": {
          "type": "string",
          "description": "Fraction of members required for quorum (0.0 - 1.0)"
        },
        "approvalThreshold": {
          "type": "string",
          "description": "Fraction of votes required to approve (0.0 - 1.0)"
        },
        "deliberationDays": {
          "type": "integer",
          "description": "Minimum days of deliberation before voting",
          "minimum": 1
        },
        "votingDays": {
          "type": "integer",
          "description": "Days voting remains open",
          "minimum": 1
        },
        "chamberSize": {
          "type": "integer",
          "description": "Max members per chamber",
          "minimum": 1
        },
        "observerSize": {
          "type": "integer",
          "description": "Max observer council size",
          "minimum": 1
        },
        "autoModeration": {
          "type": "ref",
          "ref": "#autoModeration"
        },
        "budget": {
          "type": "ref",
          "ref": "#budget"
        }
      }
    },
    "autoModeration": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "spamThreshold": {
          "type": "integer",
          "description": "Max identical messages per hour"
        },
        "toxicityThreshold": {
          "type": "string",
          "description": "ML toxicity score threshold (0.0 - 1.0)"
        }
      }
    },
    "budget": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "matchingPool": {
          "type": "string",
          "description": "Total matching funds available"
        },
        "minContribution": {
          "type": "string",
          "description": "Minimum individual contribution"
        },
        "roundDurationDays": {
          "type": "integer",
          "description": "Duration of each quadratic funding round"
        }
      }
    }
  }
}
```
