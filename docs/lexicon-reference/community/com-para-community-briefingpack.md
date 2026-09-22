---
title: com.para.community.briefingPack
description: Reference for the com.para.community.briefingPack lexicon
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
| `packType` | `string` | ✅  |  | Enum: `party_lobbying` |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `party` | `string` | ✅  |  | Max Length: 120 |
| `title` | `string` | ✅  |  | Max Length: 300 |
| `summary` | `string` | ✅  |  | Max Length: 5000 |
| `cabildeoUris` | Array of `string` | ✅  |  | Max Items: 100 |
| `civicTreeCardIds` | Array of `string` | ✅  |  | Max Items: 200 |
| `evidenceUris` | Array of `string` | ✅  |  | Max Items: 300 |
| `sembleCollectionUri` | `string` | ❌  |  | Format: `at-uri` |
| `marginCollectionUri` | `string` | ❌  |  | Format: `at-uri` |
| `obsidianExportUri` | `string` | ❌  |  | Max Length: 2000 |
| `status` | `string` | ✅  |  | Enum: `draft`, `published`, `archived` |
| `createdBy` | `string` | ✅  |  | Format: `did` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `updatedAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.briefingPack",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "packType",
          "communityUri",
          "party",
          "title",
          "summary",
          "cabildeoUris",
          "civicTreeCardIds",
          "evidenceUris",
          "status",
          "createdBy",
          "createdAt",
          "updatedAt"
        ],
        "properties": {
          "packType": {
            "type": "string",
            "enum": [
              "party_lobbying"
            ]
          },
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "party": {
            "type": "string",
            "maxLength": 120
          },
          "title": {
            "type": "string",
            "maxLength": 300
          },
          "summary": {
            "type": "string",
            "maxLength": 5000
          },
          "cabildeoUris": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "at-uri"
            },
            "maxLength": 100
          },
          "civicTreeCardIds": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 200
            },
            "maxLength": 200
          },
          "evidenceUris": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 2000
            },
            "maxLength": 300
          },
          "sembleCollectionUri": {
            "type": "string",
            "format": "at-uri"
          },
          "marginCollectionUri": {
            "type": "string",
            "format": "at-uri"
          },
          "obsidianExportUri": {
            "type": "string",
            "maxLength": 2000
          },
          "status": {
            "type": "string",
            "enum": [
              "draft",
              "published",
              "archived"
            ]
          },
          "createdBy": {
            "type": "string",
            "format": "did"
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
