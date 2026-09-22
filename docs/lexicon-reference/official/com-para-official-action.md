---
title: com.para.official.action
description: Reference for the com.para.official.action lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Public official action emitted by a civic entity with private controller auditability.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `entity` | `string` | ✅  |  | Max Length: 500 |
| `entityName` | `string` | ❌  |  | Max Length: 300 |
| `actionType` | `string` | ✅  |  | Known Values: `pajareo.response`, `post.write`, `cabildeo.signature` |
| `subjectUri` | `string` | ✅  |  | Max Length: 1000 |
| `recordUri` | `string` | ❌  |  | Format: `at-uri` |
| `controllerHash` | `string` | ✅  |  | Max Length: 128 |
| `controllerVisibility` | `string` | ✅  |  | Known Values: `entity_default`, `revealed` |
| `revealedControllerDid` | `string` | ❌  |  | Format: `did` |
| `summary` | `string` | ✅  |  | Max Length: 3000 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.official.action",
  "defs": {
    "main": {
      "type": "record",
      "description": "Public official action emitted by a civic entity with private controller auditability.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "entity",
          "actionType",
          "subjectUri",
          "controllerHash",
          "controllerVisibility",
          "summary",
          "createdAt"
        ],
        "properties": {
          "entity": {
            "type": "string",
            "maxLength": 500
          },
          "entityName": {
            "type": "string",
            "maxLength": 300
          },
          "actionType": {
            "type": "string",
            "knownValues": [
              "pajareo.response",
              "post.write",
              "cabildeo.signature"
            ]
          },
          "subjectUri": {
            "type": "string",
            "maxLength": 1000
          },
          "recordUri": {
            "type": "string",
            "format": "at-uri"
          },
          "controllerHash": {
            "type": "string",
            "maxLength": 128
          },
          "controllerVisibility": {
            "type": "string",
            "knownValues": [
              "entity_default",
              "revealed"
            ]
          },
          "revealedControllerDid": {
            "type": "string",
            "format": "did"
          },
          "summary": {
            "type": "string",
            "maxLength": 3000
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
