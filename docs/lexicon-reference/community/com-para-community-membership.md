---
title: com.para.community.membership
description: Reference for the com.para.community.membership lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Membership state of an actor in a Para community.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  | Reference to the community board record. | Format: `at-uri` |
| `membershipState` | `string` | ✅  |  | Known Values: `pending`, `active`, `left`, `removed`, `blocked` |
| `roles` | Array of `string` | ❌  |  | Max Items: 16 |
| `roleAssignments` | Array of [`#roleAssignment`](#roleassignment) | ❌  | Structured role assignments with expiration and ratification for horizontal governance. | Max Items: 16 |
| `source` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `chamberAssignment` | `string` | ❌  | Assigned chamber for bicameral deliberation. Null until assigned by sortition. | Known Values: `A`, `B` |
| `joinedAt` | `string` | ✅  |  | Format: `datetime` |
| `leftAt` | `string` | ❌  |  | Format: `datetime` |

---

<a name="roleassignment"></a>
### `roleAssignment`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `role` | `string` | ✅  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `validFrom` | `string` | ❌  | When this role assignment becomes valid. Defaults to creation time. | Format: `datetime` |
| `validUntil` | `string` | ❌  | When this role assignment expires. Required for horizontal governance rotations. | Format: `datetime` |
| `ratifiedBy` | `string` | ❌  | Reference to an approved com.para.community.decision or com.para.civic.cabildeo record that ratified this role. | Format: `at-uri` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.membership",
  "defs": {
    "main": {
      "type": "record",
      "description": "Membership state of an actor in a Para community.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "community",
          "membershipState",
          "joinedAt"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri",
            "description": "Reference to the community board record."
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
            "maxLength": 16,
            "items": {
              "type": "string",
              "maxLength": 64,
              "maxGraphemes": 64
            }
          },
          "roleAssignments": {
            "type": "array",
            "maxLength": 16,
            "description": "Structured role assignments with expiration and ratification for horizontal governance.",
            "items": {
              "type": "ref",
              "ref": "#roleAssignment"
            }
          },
          "source": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64
          },
          "chamberAssignment": {
            "type": "string",
            "description": "Assigned chamber for bicameral deliberation. Null until assigned by sortition.",
            "knownValues": [
              "A",
              "B"
            ]
          },
          "joinedAt": {
            "type": "string",
            "format": "datetime"
          },
          "leftAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    },
    "roleAssignment": {
      "type": "object",
      "required": [
        "role"
      ],
      "properties": {
        "role": {
          "type": "string",
          "maxLength": 64,
          "maxGraphemes": 64
        },
        "validFrom": {
          "type": "string",
          "format": "datetime",
          "description": "When this role assignment becomes valid. Defaults to creation time."
        },
        "validUntil": {
          "type": "string",
          "format": "datetime",
          "description": "When this role assignment expires. Required for horizontal governance rotations."
        },
        "ratifiedBy": {
          "type": "string",
          "format": "at-uri",
          "description": "Reference to an approved com.para.community.decision or com.para.civic.cabildeo record that ratified this role."
        }
      }
    }
  }
}
```
