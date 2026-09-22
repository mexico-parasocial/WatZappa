---
title: com.para.social.postMeta
description: Reference for the com.para.social.postMeta lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Metadata associated with a Para post.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
| `postType` | `string` | ✅  |  | Enum: `policy`, `matter`, `meme` |
| `official` | `boolean` | ❌  |  | Default: `false` |
| `party` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `community` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `category` | `string` | ❌  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `tags` | Array of `string` | ❌  |  | Max Items: 16 |
| `flairs` | Array of `string` | ❌  |  | Max Items: 16 |
| `voteScore` | `integer` | ✅  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.social.postMeta",
  "defs": {
    "main": {
      "type": "record",
      "description": "Metadata associated with a Para post.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "post",
          "postType",
          "voteScore",
          "createdAt"
        ],
        "properties": {
          "post": {
            "type": "string",
            "format": "at-uri"
          },
          "postType": {
            "type": "string",
            "enum": [
              "policy",
              "matter",
              "meme"
            ]
          },
          "official": {
            "type": "boolean",
            "default": false
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
          "category": {
            "type": "string",
            "maxLength": 64,
            "maxGraphemes": 64
          },
          "tags": {
            "type": "array",
            "maxLength": 16,
            "items": {
              "type": "string",
              "maxLength": 64,
              "maxGraphemes": 64
            }
          },
          "flairs": {
            "type": "array",
            "maxLength": 16,
            "items": {
              "type": "string",
              "maxLength": 64,
              "maxGraphemes": 64
            }
          },
          "voteScore": {
            "type": "integer"
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
