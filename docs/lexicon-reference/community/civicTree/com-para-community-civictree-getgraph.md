---
title: com.para.community.civicTree.getGraph
description: Reference for the com.para.community.civicTree.getGraph lexicon
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

**Schema Type:** [`com.para.community.civicTree.defs#graphView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#graphView]])



---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.getGraph",
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
          "type": "ref",
          "ref": "com.para.community.civicTree.defs#graphView"
        }
      }
    }
  }
}
```
