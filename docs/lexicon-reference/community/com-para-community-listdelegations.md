---
title: com.para.community.listDelegations
description: Reference for the com.para.community.listDelegations lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `delegator` | `string` | ❌  |  | Format: `did` |
| `delegate` | `string` | ❌  |  | Format: `did` |
| `community` | `string` | ❌  |  | Format: `at-uri` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `delegations` | Array of [`#delegationView`](#delegationview) | ✅  |  |  |

---

<a name="delegationview"></a>
### `delegationView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `delegate` | `string` | ✅  |  | Format: `did` |
| `delegator` | `string` | ✅  |  | Format: `did` |
| `delegateRole` | `string` | ❌  |  |  |
| `party` | `string` | ❌  |  |  |
| `scope` | [`com.para.community.delegation#delegationScope`]([[com-para-community-delegation|com.para.community.delegation#delegationScope]]) | ✅  |  |  |
| `expiresAt` | `string` | ❌  |  | Format: `datetime` |
| `revokedAt` | `string` | ❌  |  | Format: `datetime` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listDelegations",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "properties": {
          "delegator": {
            "type": "string",
            "format": "did"
          },
          "delegate": {
            "type": "string",
            "format": "did"
          },
          "community": {
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
            "delegations"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "delegations": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#delegationView"
              }
            }
          }
        }
      }
    },
    "delegationView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "delegate",
        "delegator",
        "scope",
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
        "delegate": {
          "type": "string",
          "format": "did"
        },
        "delegator": {
          "type": "string",
          "format": "did"
        },
        "delegateRole": {
          "type": "string"
        },
        "party": {
          "type": "string"
        },
        "scope": {
          "type": "ref",
          "ref": "com.para.community.delegation#delegationScope"
        },
        "expiresAt": {
          "type": "string",
          "format": "datetime"
        },
        "revokedAt": {
          "type": "string",
          "format": "datetime"
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
