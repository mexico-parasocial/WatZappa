---
title: com.para.civic.listDelegationCandidates
description: Reference for the com.para.civic.listDelegationCandidates lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists real delegation candidates for a cabildeo/community.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `communityId` | `string` | ❌  |  | Max Length: 256 |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="candidateview"></a>
### `candidateView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ✅  |  | Format: `did` |
| `handle` | `string` | ❌  |  | Format: `handle` |
| `displayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `avatar` | `string` | ❌  |  | Format: `uri` |
| `description` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `roles` | Array of `string` | ✅  |  |  |
| `activeDelegationCount` | `integer` | ✅  |  | Min: 0 |
| `hasVoted` | `boolean` | ✅  |  |  |
| `votedAt` | `string` | ❌  |  | Format: `datetime` |
| `selectedOption` | `integer` | ❌  |  | Min: 0 |

---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `candidates` | Array of [`#candidateView`](#candidateview) | ✅  |  |  |
| `cursor` | `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.listDelegationCandidates",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists real delegation candidates for a cabildeo/community.",
      "auth": {
        "type": "access"
      },
      "parameters": {
        "type": "params",
        "required": [
          "cabildeo"
        ],
        "properties": {
          "cabildeo": {
            "type": "string",
            "format": "at-uri"
          },
          "communityId": {
            "type": "string",
            "maxLength": 256
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
          "type": "ref",
          "ref": "#output"
        }
      }
    },
    "candidateView": {
      "type": "object",
      "required": [
        "did",
        "roles",
        "activeDelegationCount",
        "hasVoted"
      ],
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "handle": {
          "type": "string",
          "format": "handle"
        },
        "displayName": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 640
        },
        "avatar": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 3000
        },
        "roles": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        },
        "activeDelegationCount": {
          "type": "integer",
          "minimum": 0
        },
        "hasVoted": {
          "type": "boolean"
        },
        "votedAt": {
          "type": "string",
          "format": "datetime"
        },
        "selectedOption": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "candidates"
      ],
      "properties": {
        "candidates": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#candidateView"
          }
        },
        "cursor": {
          "type": "string"
        }
      }
    }
  }
}
```
