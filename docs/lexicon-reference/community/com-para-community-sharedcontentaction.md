---
title: com.para.community.sharedContentAction
description: Reference for the com.para.community.sharedContentAction lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A community moderation or audit action against a member-owned shared content wrapper.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `sharedContent` | [`com.atproto.repo.strongRef`](https://github.com/bluesky-social/atproto/tree/main/lexicons/com/atproto/repo/strongref.json#undefined) | ✅  |  |  |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `action` | `string` | ✅  |  | Known Values: `remove`, `restore`, `pin`, `unpin` |
| `note` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.sharedContentAction",
  "defs": {
    "main": {
      "type": "record",
      "description": "A community moderation or audit action against a member-owned shared content wrapper.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "sharedContent",
          "communityUri",
          "action",
          "createdAt"
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
          "action": {
            "type": "string",
            "knownValues": [
              "remove",
              "restore",
              "pin",
              "unpin"
            ]
          },
          "note": {
            "type": "string",
            "maxGraphemes": 300,
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
