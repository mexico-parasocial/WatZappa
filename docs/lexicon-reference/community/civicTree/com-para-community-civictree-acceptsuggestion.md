---
title: com.para.community.civicTree.acceptSuggestion
description: Reference for the com.para.community.civicTree.acceptSuggestion lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `communityUri` | `string` | ❌  |  | Format: `at-uri` |
| `authorDid` | `string` | ✅  |  | Format: `did` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.acceptSuggestion",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "id",
            "authorDid"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "communityUri": {
              "type": "string",
              "format": "at-uri"
            },
            "authorDid": {
              "type": "string",
              "format": "did"
            }
          }
        }
      }
    }
  }
}
```
