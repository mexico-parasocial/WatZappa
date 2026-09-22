---
title: com.para.community.exportObsidianVault
description: Reference for the com.para.community.exportObsidianVault lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ❌  |  | Format: `at-uri` |
| `briefingPack` | `string` | ❌  |  | Format: `at-uri` |
| `collection` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `generatedAt` | `string` | ✅  |  | Format: `datetime` |
| `files` | Array of [`com.para.community.defs#obsidianFileView`]([[com-para-community-defs|com.para.community.defs#obsidianFileView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.exportObsidianVault",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "briefingPack": {
            "type": "string",
            "format": "at-uri"
          },
          "collection": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "generatedAt",
            "files"
          ],
          "properties": {
            "generatedAt": {
              "type": "string",
              "format": "datetime"
            },
            "files": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.community.defs#obsidianFileView"
              }
            }
          }
        }
      }
    }
  }
}
```
