---
title: com.para.official.controller
description: Reference for the com.para.official.controller lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Private-auditable human controller for an official civic entity.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `entity` | `string` | ✅  |  | Max Length: 500 |
| `controllerDid` | `string` | ✅  |  | Format: `did` |
| `displayName` | `string` | ❌  |  | Max Length: 300 |
| `scopes` | Array of `string` | ✅  |  | Max Items: 20 |
| `status` | `string` | ✅  |  | Known Values: `pending`, `active`, `revoked` |
| `visibilityDefault` | `string` | ❌  |  | Known Values: `entity_default`, `revealed` |
| `approvedByDid` | `string` | ❌  |  | Format: `did` |
| `expiresAt` | `string` | ❌  |  | Format: `datetime` |
| `revokedAt` | `string` | ❌  |  | Format: `datetime` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.official.controller",
  "defs": {
    "main": {
      "type": "record",
      "description": "Private-auditable human controller for an official civic entity.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "entity",
          "controllerDid",
          "scopes",
          "status",
          "createdAt"
        ],
        "properties": {
          "entity": {
            "type": "string",
            "maxLength": 500
          },
          "controllerDid": {
            "type": "string",
            "format": "did"
          },
          "displayName": {
            "type": "string",
            "maxLength": 300
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string",
              "knownValues": [
                "official.profile.manage",
                "official.controllers.manage",
                "official.post.write",
                "official.pajareo.respond",
                "official.cabildeo.sign",
                "official.audit.view"
              ]
            },
            "maxLength": 20
          },
          "status": {
            "type": "string",
            "knownValues": [
              "pending",
              "active",
              "revoked"
            ]
          },
          "visibilityDefault": {
            "type": "string",
            "knownValues": [
              "entity_default",
              "revealed"
            ]
          },
          "approvedByDid": {
            "type": "string",
            "format": "did"
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
}
```
