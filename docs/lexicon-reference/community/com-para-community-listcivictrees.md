---
title: com.para.community.listCivicTrees
description: Reference for the com.para.community.listCivicTrees lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `stance` | `string` | ❌  |  | Enum: `for`, `against`, `neutral`, `bridging` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `50` |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `statements` | Array of [`#statementView`](#statementview) | ✅  |  |  |

---

<a name="statementview"></a>
### `statementView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `creator` | `string` | ✅  |  | Format: `did` |
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `body` | `string` | ✅  |  |  |
| `stance` | `string` | ✅  |  | Enum: `for`, `against`, `neutral`, `bridging` |
| `agreeCount` | `integer` | ✅  |  |  |
| `disagreeCount` | `integer` | ✅  |  |  |
| `passCount` | `integer` | ✅  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listCivicTrees",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": [
          "proposal"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri"
          },
          "stance": {
            "type": "string",
            "enum": [
              "for",
              "against",
              "neutral",
              "bridging"
            ]
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "statements"
          ],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "statements": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#statementView"
              }
            }
          }
        }
      }
    },
    "statementView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "creator",
        "proposal",
        "body",
        "stance",
        "agreeCount",
        "disagreeCount",
        "passCount",
        "createdAt"
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
        "creator": {
          "type": "string",
          "format": "did"
        },
        "proposal": {
          "type": "string",
          "format": "at-uri"
        },
        "body": {
          "type": "string"
        },
        "stance": {
          "type": "string",
          "enum": [
            "for",
            "against",
            "neutral",
            "bridging"
          ]
        },
        "agreeCount": {
          "type": "integer"
        },
        "disagreeCount": {
          "type": "integer"
        },
        "passCount": {
          "type": "integer"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
