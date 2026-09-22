---
title: com.para.community.restoreSharedContent
description: Reference for the com.para.community.restoreSharedContent lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Restores a previously removed sharedContent wrapper by creating a moderation action record.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#input`](#input)


**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="input"></a>
### `input`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `sharedContent` | [`com.atproto.repo.strongRef`](https://github.com/bluesky-social/atproto/tree/main/lexicons/com/atproto/repo/strongref.json#undefined) | ✅  |  |  |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `note` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |

---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `action` | [`com.para.community.defs#sharedContentActionView`]([[com-para-community-defs|com.para.community.defs#sharedContentActionView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.restoreSharedContent",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Restores a previously removed sharedContent wrapper by creating a moderation action record.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "#input"
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
    "input": {
      "type": "object",
      "required": [
        "sharedContent",
        "communityUri"
      ],
      "properties": {
        "sharedContent": {
          "type": "ref",
          "ref": "com.atproto.repo.strongRef"
        },
        "communityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "note": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 3000
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "action"
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
        "action": {
          "type": "ref",
          "ref": "com.para.community.defs#sharedContentActionView"
        }
      }
    }
  }
}
```
