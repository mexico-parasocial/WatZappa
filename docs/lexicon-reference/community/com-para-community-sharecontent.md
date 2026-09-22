---
title: com.para.community.shareContent
description: Reference for the com.para.community.shareContent lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Shares existing content into a PARA community by creating a member-owned sharedContent wrapper.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | [`com.atproto.repo.strongRef`](https://github.com/bluesky-social/atproto/tree/main/lexicons/com/atproto/repo/strongref.json#undefined) | ✅  |  |  |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `contentType` | `string` | ✅  |  | Known Values: `post`, `cabildeo`, `collection`, `mapInitiative`, `external` |
| `note` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `visibility` | `string` | ❌  |  | Known Values: `community`, `public`, `stewards` |
| `sourceApp` | `string` | ❌  |  | Max Length: 512<br/>Max Graphemes: 128 |
| `embedContext` | `unknown` | ❌  |  |  |
| `pinned` | `boolean` | ❌  |  |  |
| `sortRank` | `integer` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `sharedContent` | [`com.para.community.defs#sharedContentView`]([[com-para-community-defs|com.para.community.defs#sharedContentView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.shareContent",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Shares existing content into a PARA community by creating a member-owned sharedContent wrapper.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "subject",
            "communityUri",
            "contentType"
          ],
          "properties": {
            "subject": {
              "type": "ref",
              "ref": "com.atproto.repo.strongRef"
            },
            "communityUri": {
              "type": "string",
              "format": "at-uri"
            },
            "contentType": {
              "type": "string",
              "knownValues": [
                "post",
                "cabildeo",
                "collection",
                "mapInitiative",
                "external"
              ]
            },
            "note": {
              "type": "string",
              "maxGraphemes": 300,
              "maxLength": 3000
            },
            "visibility": {
              "type": "string",
              "knownValues": [
                "community",
                "public",
                "stewards"
              ]
            },
            "sourceApp": {
              "type": "string",
              "maxGraphemes": 128,
              "maxLength": 512
            },
            "embedContext": {
              "type": "unknown"
            },
            "pinned": {
              "type": "boolean"
            },
            "sortRank": {
              "type": "integer"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "#output"
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "sharedContent"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "sharedContent": {
          "type": "ref",
          "ref": "com.para.community.defs#sharedContentView"
        }
      }
    }
  }
}
```
