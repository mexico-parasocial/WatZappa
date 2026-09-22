---
title: com.para.community.getCivicTree
description: Reference for the com.para.community.getCivicTree lexicon
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
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `nodes` | Array of `unknown` | ✅  |  |  |
| `edges` | Array of `unknown` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.getCivicTree",
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
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "nodes",
            "edges"
          ],
          "properties": {
            "nodes": {
              "type": "array",
              "items": {
                "type": "unknown"
              }
            },
            "edges": {
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
