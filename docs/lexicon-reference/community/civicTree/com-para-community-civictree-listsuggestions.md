---
title: com.para.community.civicTree.listSuggestions
description: Reference for the com.para.community.civicTree.listSuggestions lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `status` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `suggestions` | Array of `unknown` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.listSuggestions",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "community"
        ],
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "status": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "suggestions"
          ],
          "properties": {
            "suggestions": {
              "type": "array",
              "items": {
                "type": "unknown"
              }
            }
          }
        }
      }
    }
  }
}
```
