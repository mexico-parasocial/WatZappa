---
title: com.para.community.getBoard
description: Reference for the com.para.community.getBoard lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Returns a hydrated PARA community board with viewer membership and governance summary.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityId` | `string` | ❌  |  | Max Length: 256 |
| `uri` | `string` | ❌  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



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
| `governanceMode` | `string` | ❌  |  | Known Values: `hierarchical`, `horizontal` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `governanceSummary` | [`#governanceSummary`](#governancesummary) | ❌  |  |  |

---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `board` | [`#boardView`](#boardview) | ✅  |  |  |
| `viewerCapabilities` | Array of `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.getBoard",
  "defs": {
    "main": {
      "type": "query",
      "description": "Returns a hydrated PARA community board with viewer membership and governance summary.",
      "parameters": {
        "type": "params",
        "properties": {
          "communityId": {
            "type": "string",
            "maxLength": 256
          },
          "uri": {
            "type": "string",
            "format": "at-uri"
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
        "governanceMode": {
          "type": "string",
          "knownValues": [
            "hierarchical",
            "horizontal"
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "governanceSummary": {
          "type": "ref",
          "ref": "#governanceSummary"
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "board",
        "viewerCapabilities"
      ],
      "properties": {
        "board": {
          "type": "ref",
          "ref": "#boardView"
        },
        "viewerCapabilities": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        }
      }
    }
  }
}
```
