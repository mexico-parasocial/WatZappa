---
title: com.para.community.civicTree.rejectSuggestion
description: Reference for the com.para.community.civicTree.rejectSuggestion lexicon
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

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.rejectSuggestion",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "id"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "communityUri": {
              "type": "string",
              "format": "at-uri"
            }
          }
        }
      }
    }
  }
}
```
