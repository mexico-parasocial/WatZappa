---
title: com.para.community.listIntensities
description: Reference for the com.para.community.listIntensities lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `intensities` | Array of [`#intensityView`](#intensityview) | ✅  |  |  |

---

<a name="intensityview"></a>
### `intensityView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `voter` | `string` | ✅  |  | Format: `did` |
| `signal` | `integer` | ✅  |  | Min: -3<br/>Max: 3 |
| `units` | `integer` | ✅  |  | Min: 1<br/>Max: 16 |
| `creditsSpent` | `integer` | ❌  |  |  |
| `delegatedFrom` | Array of `string` | ❌  |  |  |
| `delegationDepth` | `integer` | ❌  |  |  |
| `effectiveWeight` | `string` | ❌  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listIntensities",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "proposal"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "intensities"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "intensities": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#intensityView"
              }
            }
          }
        }
      }
    },
    "intensityView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "proposal",
        "voter",
        "signal",
        "units",
        "createdAt"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "proposal": {
          "type": "string",
          "format": "at-uri"
        },
        "voter": {
          "type": "string",
          "format": "did"
        },
        "signal": {
          "type": "integer",
          "minimum": -3,
          "maximum": 3
        },
        "units": {
          "type": "integer",
          "minimum": 1,
          "maximum": 16
        },
        "creditsSpent": {
          "type": "integer"
        },
        "delegatedFrom": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "did"
          }
        },
        "delegationDepth": {
          "type": "integer"
        },
        "effectiveWeight": {
          "type": "string"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
