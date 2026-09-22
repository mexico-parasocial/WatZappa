---
title: com.para.community.governanceConfig
description: Reference for the com.para.community.governanceConfig lexicon
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
| `community` | `string` | ✅  | Community this governance config applies to | Format: `at-uri` |
| `version` | `string` | ✅  | Semver of this config. Changes only by direct flat vote (no delegation). |  |
| `metaRules` | [`#metaRules`](#metarules) | ✅  |  |  |
| `deliberation` | [`#deliberationRules`](#deliberationrules) | ❌  |  |  |
| `delegation` | [`#delegationRules`](#delegationrules) | ❌  |  |  |
| `counting` | [`#countingRules`](#countingrules) | ❌  |  |  |
| `visibility` | [`#visibilityRules`](#visibilityrules) | ❌  |  |  |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

<a name="metarules"></a>
### `metaRules`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `quorumPct` | `integer` | ✅  | Minimum participation % for a vote to be valid | Min: 0<br/>Max: 100 |
| `thresholdPct` | `integer` | ✅  | Approval threshold for ordinary proposals | Min: 0<br/>Max: 100 |
| `amendmentQuorumPct` | `integer` | ✅  | Higher quorum required to amend this config itself | Min: 0<br/>Max: 100 |
| `maxIntensityUnits` | `integer` | ❌  | Cap on quadratic voice credits per voter per proposal | Min: 1<br/>Max: 16 |

---

<a name="deliberationrules"></a>
### `deliberationRules`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `windowHours` | `integer` | ❌  | Hours of mandatory deliberation before voting opens |  |
| `minStatements` | `integer` | ❌  | Minimum statements required to open voting |  |
| `clusteringEnabled` | `boolean` | ❌  | Whether Polis-style clustering is active |  |

---

<a name="delegationrules"></a>
### `delegationRules`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `eligibleRoles` | Array of `string` | ❌  | Roles that can receive delegation: representative, moderator, official, board_member, etc. |  |
| `maxDepth` | `integer` | ❌  | Max delegation hops. PARA default is 1. | Min: 0<br/>Max: 2 |
| `autoExpireDays` | `integer` | ❌  | Default delegation expiry in days |  |

---

<a name="countingrules"></a>
### `countingRules`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `modes` | Array of `string` | ❌  | Available tally modes. Only flat is binding; others run in shadow mode until explicitly promoted. |  |
| `correlationAlpha` | `integer` | ❌  | Correlation discount strength, fixed-point scaled by 10000 (e.g. 2500 = 0.25). 0 = disabled. | Min: 0<br/>Max: 10000 |
| `bindingMode` | `string` | ❌  | Which mode currently produces the binding tally. Default: flat. | Enum: `flat`, `sqrt_n`, `correlation_adjusted` |

---

<a name="visibilityrules"></a>
### `visibilityRules`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `deliberationPublic` | `boolean` | ❌  | Whether deliberation statements are publicly visible |  |
| `votesPublic` | `boolean` | ❌  | Whether individual votes are public or only aggregates |  |
| `delegationGraphPublic` | `boolean` | ❌  | Whether delegation chains are publicly observable |  |

---

<a name="rolerotationrules"></a>
### `roleRotationRules`

**Type:** `object`

Term limits and rotation constraints for horizontal governance.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `facilitatorMaxDays` | `integer` | ❌  |  | Min: 1<br/>Max: 90 |
| `moderatorMaxDays` | `integer` | ❌  |  | Min: 1<br/>Max: 180 |
| `stewardMaxDays` | `integer` | ❌  |  | Min: 1<br/>Max: 365 |
| `requiresAssemblyRatification` | `boolean` | ❌  | Whether role changes require an approved assembly decision record. |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.governanceConfig",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "community",
          "version",
          "metaRules"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri",
            "description": "Community this governance config applies to"
          },
          "version": {
            "type": "string",
            "description": "Semver of this config. Changes only by direct flat vote (no delegation)."
          },
          "metaRules": {
            "type": "ref",
            "ref": "#metaRules"
          },
          "deliberation": {
            "type": "ref",
            "ref": "#deliberationRules"
          },
          "delegation": {
            "type": "ref",
            "ref": "#delegationRules"
          },
          "counting": {
            "type": "ref",
            "ref": "#countingRules"
          },
          "visibility": {
            "type": "ref",
            "ref": "#visibilityRules"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    },
    "metaRules": {
      "type": "object",
      "required": [
        "quorumPct",
        "thresholdPct",
        "amendmentQuorumPct"
      ],
      "properties": {
        "quorumPct": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "Minimum participation % for a vote to be valid"
        },
        "thresholdPct": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "Approval threshold for ordinary proposals"
        },
        "amendmentQuorumPct": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "Higher quorum required to amend this config itself"
        },
        "maxIntensityUnits": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16,
          "description": "Cap on quadratic voice credits per voter per proposal"
        }
      }
    },
    "deliberationRules": {
      "type": "object",
      "properties": {
        "windowHours": {
          "type": "integer",
          "description": "Hours of mandatory deliberation before voting opens"
        },
        "minStatements": {
          "type": "integer",
          "description": "Minimum statements required to open voting"
        },
        "clusteringEnabled": {
          "type": "boolean",
          "description": "Whether Polis-style clustering is active"
        }
      }
    },
    "delegationRules": {
      "type": "object",
      "properties": {
        "eligibleRoles": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Roles that can receive delegation: representative, moderator, official, board_member, etc."
        },
        "maxDepth": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2,
          "description": "Max delegation hops. PARA default is 1."
        },
        "autoExpireDays": {
          "type": "integer",
          "description": "Default delegation expiry in days"
        }
      }
    },
    "countingRules": {
      "type": "object",
      "properties": {
        "modes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "flat",
              "sqrt_n",
              "correlation_adjusted"
            ]
          },
          "description": "Available tally modes. Only flat is binding; others run in shadow mode until explicitly promoted."
        },
        "correlationAlpha": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10000,
          "description": "Correlation discount strength, fixed-point scaled by 10000 (e.g. 2500 = 0.25). 0 = disabled."
        },
        "bindingMode": {
          "type": "string",
          "enum": [
            "flat",
            "sqrt_n",
            "correlation_adjusted"
          ],
          "description": "Which mode currently produces the binding tally. Default: flat."
        }
      }
    },
    "visibilityRules": {
      "type": "object",
      "properties": {
        "deliberationPublic": {
          "type": "boolean",
          "description": "Whether deliberation statements are publicly visible"
        },
        "votesPublic": {
          "type": "boolean",
          "description": "Whether individual votes are public or only aggregates"
        },
        "delegationGraphPublic": {
          "type": "boolean",
          "description": "Whether delegation chains are publicly observable"
        }
      }
    },
    "roleRotationRules": {
      "type": "object",
      "description": "Term limits and rotation constraints for horizontal governance.",
      "properties": {
        "facilitatorMaxDays": {
          "type": "integer",
          "minimum": 1,
          "maximum": 90
        },
        "moderatorMaxDays": {
          "type": "integer",
          "minimum": 1,
          "maximum": 180
        },
        "stewardMaxDays": {
          "type": "integer",
          "minimum": 1,
          "maximum": 365
        },
        "requiresAssemblyRatification": {
          "type": "boolean",
          "description": "Whether role changes require an approved assembly decision record."
        }
      }
    }
  }
}
```
