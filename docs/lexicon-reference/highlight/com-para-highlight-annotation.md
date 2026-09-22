---
title: com.para.highlight.annotation
description: Reference for the com.para.highlight.annotation lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A public or private highlight annotation over a post or record.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subjectUri` | `string` | ✅  |  | Format: `at-uri` |
| `subjectCid` | `string` | ❌  | Optional CID of the highlighted record at creation time. |  |
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
  "id": "com.para.highlight.annotation",
  "defs": {
    "main": {
      "type": "record",
      "description": "A public or private highlight annotation over a post or record.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "subjectUri",
          "text",
          "start",
          "end",
          "color",
          "visibility",
          "createdAt"
        ],
        "properties": {
          "subjectUri": {
            "type": "string",
            "format": "at-uri"
          },
          "subjectCid": {
            "type": "string",
            "description": "Optional CID of the highlighted record at creation time."
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
}
```
