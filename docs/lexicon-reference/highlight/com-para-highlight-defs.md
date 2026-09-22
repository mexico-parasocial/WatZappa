---
title: com.para.highlight.defs
description: Reference for the com.para.highlight.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="highlightview"></a>
### `highlightView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `cid-link` | ✅  |  |  |
| `creator` | `string` | ✅  |  | Format: `did` |
| `indexedAt` | `string` | ✅  |  | Format: `datetime` |
| `subjectUri` | `string` | ✅  |  | Format: `at-uri` |
| `subjectCid` | `string` | ❌  |  |  |
| `text` | `string` | ✅  |  | Max Length: 2000 |
| `start` | `integer` | ✅  |  | Min: 0 |
| `end` | `integer` | ✅  |  | Min: 0 |
| `color` | `string` | ✅  |  | Max Length: 32 |
| `tag` | `string` | ❌  |  | Max Length: 128 |
| `community` | `string` | ❌  |  | Max Length: 100 |
| `state` | `string` | ❌  |  | Max Length: 100 |
| `party` | `string` | ❌  |  | Max Length: 100 |
| `visibility` | `string` | ✅  |  | Known Values: `public`, `private` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.highlight.defs",
  "defs": {
    "highlightView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "creator",
        "indexedAt",
        "subjectUri",
        "text",
        "start",
        "end",
        "color",
        "visibility",
        "createdAt"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "cid-link"
        },
        "creator": {
          "type": "string",
          "format": "did"
        },
        "indexedAt": {
          "type": "string",
          "format": "datetime"
        },
        "subjectUri": {
          "type": "string",
          "format": "at-uri"
        },
        "subjectCid": {
          "type": "string"
        },
        "text": {
          "type": "string",
          "maxLength": 2000
        },
        "start": {
          "type": "integer",
          "minimum": 0
        },
        "end": {
          "type": "integer",
          "minimum": 0
        },
        "color": {
          "type": "string",
          "maxLength": 32
        },
        "tag": {
          "type": "string",
          "maxLength": 128
        },
        "community": {
          "type": "string",
          "maxLength": 100
        },
        "state": {
          "type": "string",
          "maxLength": 100
        },
        "party": {
          "type": "string",
          "maxLength": 100
        },
        "visibility": {
          "type": "string",
          "knownValues": [
            "public",
            "private"
          ]
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
