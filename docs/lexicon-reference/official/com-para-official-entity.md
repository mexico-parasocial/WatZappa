---
title: com.para.official.entity
description: Reference for the com.para.official.entity lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Official civic entity account reserved or verified by PARA.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `kind` | `string` | ✅  |  | Known Values: `representative`, `office`, `community`, `party`, `ngo` |
| `status` | `string` | ✅  |  | Known Values: `unclaimed`, `verified`, `retired` |
| `name` | `string` | ✅  |  | Max Length: 300 |
| `handle` | `string` | ❌  |  | Max Length: 300 |
| `entityDid` | `string` | ❌  |  | Format: `did` |
| `representativeId` | `string` | ❌  |  | Max Length: 200 |
| `office` | `string` | ❌  |  | Max Length: 300 |
| `jurisdiction` | `string` | ❌  |  | Max Length: 300 |
| `state` | `string` | ❌  |  | Max Length: 120 |
| `source` | `string` | ❌  |  | Max Length: 2000 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `updatedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.official.entity",
  "defs": {
    "main": {
      "type": "record",
      "description": "Official civic entity account reserved or verified by PARA.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "kind",
          "status",
          "name",
          "createdAt"
        ],
        "properties": {
          "kind": {
            "type": "string",
            "knownValues": [
              "representative",
              "office",
              "community",
              "party",
              "ngo"
            ]
          },
          "status": {
            "type": "string",
            "knownValues": [
              "unclaimed",
              "verified",
              "retired"
            ]
          },
          "name": {
            "type": "string",
            "maxLength": 300
          },
          "handle": {
            "type": "string",
            "maxLength": 300
          },
          "entityDid": {
            "type": "string",
            "format": "did"
          },
          "representativeId": {
            "type": "string",
            "maxLength": 200
          },
          "office": {
            "type": "string",
            "maxLength": 300
          },
          "jurisdiction": {
            "type": "string",
            "maxLength": 300
          },
          "state": {
            "type": "string",
            "maxLength": 120
          },
          "source": {
            "type": "string",
            "maxLength": 2000
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          },
          "updatedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
