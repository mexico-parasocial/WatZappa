---
title: com.para.community.updateBriefingPack
description: Reference for the com.para.community.updateBriefingPack lexicon
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
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ❌  |  | Format: `cid` |
| `pack` | [`#packInput`](#packinput) | ✅  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `pack` | [`com.para.community.defs#briefingPackView`]([[com-para-community-defs|com.para.community.defs#briefingPackView]]) | ✅  |  |  |

---

<a name="packinput"></a>
### `packInput`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `party` | `string` | ❌  |  | Max Length: 120 |
| `title` | `string` | ❌  |  | Max Length: 300 |
| `summary` | `string` | ❌  |  | Max Length: 5000 |
| `cabildeoUris` | Array of `string` | ❌  |  | Max Items: 100 |
| `civicTreeCardIds` | Array of `string` | ❌  |  | Max Items: 200 |
| `evidenceUris` | Array of `string` | ❌  |  | Max Items: 300 |
| `sembleCollectionUri` | `string` | ❌  |  | Format: `at-uri` |
| `marginCollectionUri` | `string` | ❌  |  | Format: `at-uri` |
| `obsidianExportUri` | `string` | ❌  |  | Max Length: 2000 |
| `status` | `string` | ❌  |  | Enum: `draft`, `published`, `archived` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.updateBriefingPack",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "uri",
            "pack"
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
            "pack": {
              "type": "ref",
              "ref": "#packInput"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "pack"
          ],
          "properties": {
            "pack": {
              "type": "ref",
              "ref": "com.para.community.defs#briefingPackView"
            }
          }
        }
      }
    },
    "packInput": {
      "type": "object",
      "properties": {
        "party": {
          "type": "string",
          "maxLength": 120
        },
        "title": {
          "type": "string",
          "maxLength": 300
        },
        "summary": {
          "type": "string",
          "maxLength": 5000
        },
        "cabildeoUris": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "at-uri"
          },
          "maxLength": 100
        },
        "civicTreeCardIds": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 200
          },
          "maxLength": 200
        },
        "evidenceUris": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 2000
          },
          "maxLength": 300
        },
        "sembleCollectionUri": {
          "type": "string",
          "format": "at-uri"
        },
        "marginCollectionUri": {
          "type": "string",
          "format": "at-uri"
        },
        "obsidianExportUri": {
          "type": "string",
          "maxLength": 2000
        },
        "status": {
          "type": "string",
          "enum": [
            "draft",
            "published",
            "archived"
          ]
        }
      }
    }
  }
}
```
