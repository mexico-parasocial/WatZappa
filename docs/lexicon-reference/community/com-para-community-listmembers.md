---
title: com.para.community.listMembers
description: Reference for the com.para.community.listMembers lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists real members of a PARA community board.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityId` | `string` | ✅  |  | Max Length: 256 |
| `membershipState` | `string` | ❌  |  | Known Values: `pending`, `active`, `left`, `removed`, `blocked` |
| `role` | `string` | ❌  |  | Max Length: 128<br/>Max Graphemes: 64 |
| `sort` | `string` | ❌  |  | Known Values: `joined`, `participation`<br/>Default: `joined` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="memberview"></a>
### `memberView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ✅  |  | Format: `did` |
| `handle` | `string` | ❌  |  | Format: `handle` |
| `displayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `avatar` | `string` | ❌  |  | Format: `uri` |
| `membershipState` | `string` | ✅  |  | Known Values: `pending`, `active`, `left`, `removed`, `blocked` |
| `roles` | Array of `string` | ✅  |  |  |
| `joinedAt` | `string` | ✅  |  | Format: `datetime` |
| `votesCast` | `integer` | ✅  |  | Min: 0 |
| `delegationsReceived` | `integer` | ✅  |  | Min: 0 |
| `policyPosts` | `integer` | ✅  |  | Min: 0 |
| `matterPosts` | `integer` | ✅  |  | Min: 0 |

---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `members` | Array of [`#memberView`](#memberview) | ✅  |  |  |
| `cursor` | `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listMembers",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists real members of a PARA community board.",
      "auth": {
        "type": "access"
      },
      "parameters": {
        "type": "params",
        "required": [
          "communityId"
        ],
        "properties": {
          "communityId": {
            "type": "string",
            "maxLength": 256
          },
          "membershipState": {
            "type": "string",
            "knownValues": [
              "pending",
              "active",
              "left",
              "removed",
              "blocked"
            ]
          },
          "role": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          },
          "sort": {
            "type": "string",
            "knownValues": [
              "joined",
              "participation"
            ],
            "default": "joined"
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
    "memberView": {
      "type": "object",
      "required": [
        "did",
        "membershipState",
        "roles",
        "joinedAt",
        "votesCast",
        "delegationsReceived",
        "policyPosts",
        "matterPosts"
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
        "membershipState": {
          "type": "string",
          "knownValues": [
            "pending",
            "active",
            "left",
            "removed",
            "blocked"
          ]
        },
        "roles": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        },
        "joinedAt": {
          "type": "string",
          "format": "datetime"
        },
        "votesCast": {
          "type": "integer",
          "minimum": 0
        },
        "delegationsReceived": {
          "type": "integer",
          "minimum": 0
        },
        "policyPosts": {
          "type": "integer",
          "minimum": 0
        },
        "matterPosts": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "members"
      ],
      "properties": {
        "members": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#memberView"
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
