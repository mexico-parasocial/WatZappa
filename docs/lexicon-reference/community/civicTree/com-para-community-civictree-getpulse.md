---
title: com.para.community.civicTree.getPulse
description: Reference for the com.para.community.civicTree.getPulse lexicon
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
| `voter` | `string` | ❌  |  | Format: `did` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`com.para.community.civicTree.defs#pulseView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#pulseView]])



---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.getPulse",
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
          "voter": {
            "type": "string",
            "format": "did"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "com.para.community.civicTree.defs#pulseView"
        }
      }
    }
  }
}
```
