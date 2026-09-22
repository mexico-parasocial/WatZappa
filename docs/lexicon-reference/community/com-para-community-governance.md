---
title: com.para.community.governance
description: Reference for the com.para.community.governance lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A published governance record for a PARA community. This is the canonical contract for moderators, officials, deputy roles, and governance metadata exposed to clients.

**Record Key:** `any`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `communityId` | `string` | ❌  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `slug` | `string` | ✅  |  | Max Length: 128<br/>Max Graphemes: 128 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `updatedAt` | `string` | ✅  |  | Format: `datetime` |
| `moderators` | Array of [`com.para.community.defs#moderatorView`]([[com-para-community-defs|com.para.community.defs#moderatorView]]) | ✅  |  |  |
| `officials` | Array of [`com.para.community.defs#officialView`]([[com-para-community-defs|com.para.community.defs#officialView]]) | ✅  |  |  |
| `deputies` | Array of [`com.para.community.defs#deputyRoleView`]([[com-para-community-defs|com.para.community.defs#deputyRoleView]]) | ✅  |  |  |
| `metadata` | [`com.para.community.defs#metadata`]([[com-para-community-defs|com.para.community.defs#metadata]]) | ❌  |  |  |
| `roleRotationRules` | [`com.para.community.governanceConfig#roleRotationRules`]([[com-para-community-governanceconfig|com.para.community.governanceConfig#roleRotationRules]]) | ❌  |  |  |
| `editHistory` | Array of [`com.para.community.defs#historyEntry`]([[com-para-community-defs|com.para.community.defs#historyEntry]]) | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.governance",
  "defs": {
    "main": {
      "type": "record",
      "description": "A published governance record for a PARA community. This is the canonical contract for moderators, officials, deputy roles, and governance metadata exposed to clients.",
      "key": "any",
      "record": {
        "type": "object",
        "required": [
          "community",
          "slug",
          "createdAt",
          "updatedAt",
          "moderators",
          "officials",
          "deputies"
        ],
        "properties": {
          "community": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 256
          },
          "communityId": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 256
          },
          "slug": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 128
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          },
          "updatedAt": {
            "type": "string",
            "format": "datetime"
          },
          "moderators": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "com.para.community.defs#moderatorView"
            }
          },
          "officials": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "com.para.community.defs#officialView"
            }
          },
          "deputies": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "com.para.community.defs#deputyRoleView"
            }
          },
          "metadata": {
            "type": "ref",
            "ref": "com.para.community.defs#metadata"
          },
          "roleRotationRules": {
            "type": "ref",
            "ref": "com.para.community.governanceConfig#roleRotationRules"
          },
          "editHistory": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "com.para.community.defs#historyEntry"
            }
          }
        }
      }
    }
  }
}
```
