---
title: com.para.community.delegation
description: Reference for the com.para.community.delegation lexicon
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
| `delegate` | `string` | ✅  | Who receives the delegated voting power | Format: `did` |
| `delegator` | `string` | ✅  | Who is lending their voice | Format: `did` |
| `delegateRole` | `string` | ❌  | Role under which the delegate receives power: representative, moderator, official, board_member, etc. |  |
| `party` | `string` | ❌  | Party or flair context for this delegation |  |
| `scope` | [`#delegationScope`](#delegationscope) | ✅  |  |  |
| `expiresAt` | `string` | ❌  | Auto-expiration. If absent, delegation expires in 90 days by default. | Format: `datetime` |
| `revokedAt` | `string` | ❌  | When the delegator explicitly revoked this delegation | Format: `datetime` |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

<a name="delegationscope"></a>
### `delegationScope`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `mode` | `string` | ✅  |  | Enum: `community`, `topic`, `proposal`, `topicCommunity` |
| `community` | `string` | ❌  | Required for community, topicCommunity modes | Format: `at-uri` |
| `topic` | `string` | ❌  | Required for topic, topicCommunity modes | Enum: `general`, `budget`, `amendment`, `moderation` |
| `proposal` | `string` | ❌  | Required for proposal mode | Format: `at-uri` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.delegation",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "delegate",
          "delegator",
          "scope"
        ],
        "properties": {
          "delegate": {
            "type": "string",
            "format": "did",
            "description": "Who receives the delegated voting power"
          },
          "delegator": {
            "type": "string",
            "format": "did",
            "description": "Who is lending their voice"
          },
          "delegateRole": {
            "type": "string",
            "description": "Role under which the delegate receives power: representative, moderator, official, board_member, etc."
          },
          "party": {
            "type": "string",
            "description": "Party or flair context for this delegation"
          },
          "scope": {
            "type": "ref",
            "ref": "#delegationScope"
          },
          "expiresAt": {
            "type": "string",
            "format": "datetime",
            "description": "Auto-expiration. If absent, delegation expires in 90 days by default."
          },
          "revokedAt": {
            "type": "string",
            "format": "datetime",
            "description": "When the delegator explicitly revoked this delegation"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    },
    "delegationScope": {
      "type": "object",
      "required": [
        "mode"
      ],
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "community",
            "topic",
            "proposal",
            "topicCommunity"
          ]
        },
        "community": {
          "type": "string",
          "format": "at-uri",
          "description": "Required for community, topicCommunity modes"
        },
        "topic": {
          "type": "string",
          "enum": [
            "general",
            "budget",
            "amendment",
            "moderation"
          ],
          "description": "Required for topic, topicCommunity modes"
        },
        "proposal": {
          "type": "string",
          "format": "at-uri",
          "description": "Required for proposal mode"
        }
      }
    }
  }
}
```
