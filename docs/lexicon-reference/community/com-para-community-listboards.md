---
title: com.para.community.listBoards
description: Reference for the com.para.community.listBoards lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Lists PARA community boards available to the viewer, along with creation capability.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `query` | `string` | ❌  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `state` | `string` | ❌  |  | Max Length: 128<br/>Max Graphemes: 64 |
| `participationKind` | `string` | ❌  |  | Known Values: `matter`, `policy` |
| `flairId` | `string` | ❌  |  | Max Length: 128<br/>Max Graphemes: 128 |
| `sort` | `string` | ❌  |  | Known Values: `recent`, `activity`, `size`<br/>Default: `recent` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
| `quadrant` | `string` | ❌  | Optional territory quadrant to filter communities by |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="boardview"></a>
### `boardView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `creatorDid` | `string` | ✅  |  | Format: `did` |
| `creatorHandle` | `string` | ❌  |  | Format: `handle` |
| `creatorDisplayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `communityId` | `string` | ✅  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `slug` | `string` | ✅  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `name` | `string` | ✅  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `description` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `quadrant` | `string` | ✅  |  | Max Length: 128<br/>Max Graphemes: 64 |
| `delegatesChatId` | `string` | ✅  |  |  |
| `subdelegatesChatId` | `string` | ✅  |  |  |
| `memberCount` | `integer` | ✅  |  |  |
| `viewerMembershipState` | `string` | ✅  |  | Known Values: `none`, `pending`, `active`, `left`, `removed`, `blocked` |
| `viewerRoles` | Array of `string` | ❌  |  |  |
| `status` | `string` | ❌  |  | Known Values: `draft`, `active` |
| `founderStarterPackUri` | `string` | ❌  |  | Format: `at-uri` |
| `governanceSummary` | [`#governanceSummary`](#governancesummary) | ❌  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="governancesummary"></a>
### `governanceSummary`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `moderatorCount` | `integer` | ✅  |  |  |
| `officialCount` | `integer` | ✅  |  |  |
| `deputyRoleCount` | `integer` | ✅  |  |  |
| `lastPublishedAt` | `string` | ❌  |  | Format: `datetime` |

---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `boards` | Array of [`#boardView`](#boardview) | ✅  |  |  |
| `cursor` | `string` | ❌  |  |  |
| `canCreateCommunity` | `boolean` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listBoards",
  "defs": {
    "main": {
      "type": "query",
      "description": "Lists PARA community boards available to the viewer, along with creation capability.",
      "parameters": {
        "type": "params",
        "properties": {
          "query": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 256
          },
          "state": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          },
          "participationKind": {
            "type": "string",
            "knownValues": [
              "matter",
              "policy"
            ]
          },
          "flairId": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 128
          },
          "sort": {
            "type": "string",
            "knownValues": [
              "recent",
              "activity",
              "size"
            ],
            "default": "recent"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          },
          "quadrant": {
            "type": "string",
            "description": "Optional territory quadrant to filter communities by"
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
    "boardView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "creatorDid",
        "communityId",
        "slug",
        "name",
        "quadrant",
        "delegatesChatId",
        "subdelegatesChatId",
        "memberCount",
        "viewerMembershipState",
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
        "creatorDid": {
          "type": "string",
          "format": "did"
        },
        "creatorHandle": {
          "type": "string",
          "format": "handle"
        },
        "creatorDisplayName": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 640
        },
        "communityId": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 256
        },
        "slug": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 256
        },
        "name": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 256
        },
        "description": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 3000
        },
        "quadrant": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 128
        },
        "delegatesChatId": {
          "type": "string"
        },
        "subdelegatesChatId": {
          "type": "string"
        },
        "memberCount": {
          "type": "integer"
        },
        "viewerMembershipState": {
          "type": "string",
          "knownValues": [
            "none",
            "pending",
            "active",
            "left",
            "removed",
            "blocked"
          ]
        },
        "viewerRoles": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        },
        "status": {
          "type": "string",
          "knownValues": [
            "draft",
            "active"
          ]
        },
        "founderStarterPackUri": {
          "type": "string",
          "format": "at-uri"
        },
        "governanceSummary": {
          "type": "ref",
          "ref": "#governanceSummary"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "governanceSummary": {
      "type": "object",
      "required": [
        "moderatorCount",
        "officialCount",
        "deputyRoleCount"
      ],
      "properties": {
        "moderatorCount": {
          "type": "integer"
        },
        "officialCount": {
          "type": "integer"
        },
        "deputyRoleCount": {
          "type": "integer"
        },
        "lastPublishedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "boards",
        "canCreateCommunity"
      ],
      "properties": {
        "boards": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#boardView"
          }
        },
        "cursor": {
          "type": "string"
        },
        "canCreateCommunity": {
          "type": "boolean"
        }
      }
    }
  }
}
```
