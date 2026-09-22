---
title: com.para.community.eigenstate
description: Reference for the com.para.community.eigenstate lexicon
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
| `computedAt` | `string` | ✅  |  | Format: `datetime` |
| `eigenvalues` | Array of [`#eigenvalueEntry`](#eigenvalueentry) | ✅  |  |  |
| `correlationMatrix` | Array of [`#correlationEntry`](#correlationentry) | ✅  |  |  |
| `ttlSeconds` | `integer` | ❌  | Time-to-live for this snapshot before recomputation | Default: `3600` |

---

<a name="eigenvalueentry"></a>
### `eigenvalueEntry`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `component` | `string` | ✅  | Identifier for this eigencomponent (e.g., 'party_a', 'delegate_pedro') |  |
| `value` | `integer` | ✅  | Eigenvalue magnitude, fixed-point scaled by 10000 (e.g. 8675 = 0.8675) |  |
| `dids` | Array of `string` | ✅  | DIDs that load heavily on this component |  |

---

<a name="correlationentry"></a>
### `correlationEntry`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `didA` | `string` | ✅  |  | Format: `did` |
| `didB` | `string` | ✅  |  | Format: `did` |
| `correlation` | `integer` | ✅  | Correlation coefficient between these two voters, fixed-point scaled by 10000 (e.g. 8675 = 0.8675) | Min: 0<br/>Max: 10000 |
| `sources` | Array of `string` | ❌  | Why they are correlated: party, delegation, civic_stamps, etc. |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.eigenstate",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "community",
          "computedAt",
          "eigenvalues",
          "correlationMatrix"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "computedAt": {
            "type": "string",
            "format": "datetime"
          },
          "eigenvalues": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "#eigenvalueEntry"
            }
          },
          "correlationMatrix": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "#correlationEntry"
            }
          },
          "ttlSeconds": {
            "type": "integer",
            "description": "Time-to-live for this snapshot before recomputation",
            "default": 3600
          }
        }
      }
    },
    "eigenvalueEntry": {
      "type": "object",
      "required": [
        "component",
        "value",
        "dids"
      ],
      "properties": {
        "component": {
          "type": "string",
          "description": "Identifier for this eigencomponent (e.g., 'party_a', 'delegate_pedro')"
        },
        "value": {
          "type": "integer",
          "description": "Eigenvalue magnitude, fixed-point scaled by 10000 (e.g. 8675 = 0.8675)"
        },
        "dids": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "did"
          },
          "description": "DIDs that load heavily on this component"
        }
      }
    },
    "correlationEntry": {
      "type": "object",
      "required": [
        "didA",
        "didB",
        "correlation"
      ],
      "properties": {
        "didA": {
          "type": "string",
          "format": "did"
        },
        "didB": {
          "type": "string",
          "format": "did"
        },
        "correlation": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10000,
          "description": "Correlation coefficient between these two voters, fixed-point scaled by 10000 (e.g. 8675 = 0.8675)"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Why they are correlated: party, delegation, civic_stamps, etc."
        }
      }
    }
  }
}
```
