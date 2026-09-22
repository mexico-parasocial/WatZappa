---
title: com.para.actor.defs
description: Reference for the com.para.actor.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="profilestats"></a>
### `profileStats`

**Type:** `object`

Aggregated Para profile statistics.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `influence` | `integer` | ✅  | All-time influence score (Para equivalent of cumulative karma). |  |
| `votesReceivedAllTime` | `integer` | ✅  | Total support received by this actor's Para posts across all time. |  |
| `votesCastAllTime` | `integer` | ✅  | Total votes/interactions cast by this actor across all time. |  |
| `contributions` | [`#contributions`](#contributions) | ✅  |  |  |
| `activeIn` | Array of `string` | ✅  | Top communities where this actor contributes. |  |
| `computedAt` | `string` | ✅  | Timestamp of the last stats computation. | Format: `datetime` |

---

<a name="contributions"></a>
### `contributions`

**Type:** `object`

All-time contribution counters.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `policies` | `integer` | ✅  |  |  |
| `matters` | `integer` | ✅  |  |  |
| `comments` | `integer` | ✅  |  |  |

---

<a name="statusview"></a>
### `statusView`

**Type:** `object`

Resolved Para account status view.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `status` | `string` | ✅  |  | Max Length: 300<br/>Max Graphemes: 300 |
| `party` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `community` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.actor.defs",
  "defs": {
    "profileStats": {
      "type": "object",
      "description": "Aggregated Para profile statistics.",
      "required": [
        "influence",
        "votesReceivedAllTime",
        "votesCastAllTime",
        "contributions",
        "activeIn",
        "computedAt"
      ],
      "properties": {
        "influence": {
          "type": "integer",
          "description": "All-time influence score (Para equivalent of cumulative karma)."
        },
        "votesReceivedAllTime": {
          "type": "integer",
          "description": "Total support received by this actor's Para posts across all time."
        },
        "votesCastAllTime": {
          "type": "integer",
          "description": "Total votes/interactions cast by this actor across all time."
        },
        "contributions": {
          "type": "ref",
          "ref": "#contributions"
        },
        "activeIn": {
          "type": "array",
          "description": "Top communities where this actor contributes.",
          "items": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64
          }
        },
        "computedAt": {
          "type": "string",
          "format": "datetime",
          "description": "Timestamp of the last stats computation."
        }
      }
    },
    "contributions": {
      "type": "object",
      "description": "All-time contribution counters.",
      "required": [
        "policies",
        "matters",
        "comments"
      ],
      "properties": {
        "policies": {
          "type": "integer"
        },
        "matters": {
          "type": "integer"
        },
        "comments": {
          "type": "integer"
        }
      }
    },
    "statusView": {
      "type": "object",
      "description": "Resolved Para account status view.",
      "required": [
        "status",
        "createdAt"
      ],
      "properties": {
        "status": {
          "type": "string",
          "maxLength": 300,
          "maxGraphemes": 300
        },
        "party": {
          "type": "string",
          "maxLength": 64,
          "maxGraphemes": 64
        },
        "community": {
          "type": "string",
          "maxLength": 64,
          "maxGraphemes": 64
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
