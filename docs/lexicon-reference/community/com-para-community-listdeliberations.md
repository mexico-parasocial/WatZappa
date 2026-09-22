---
title: com.para.community.listDeliberations
description: Reference for the com.para.community.listDeliberations lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

List deliberation statements for a proposal.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100 |
| `cursor` | `string` | ❌  |  |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cursor` | `string` | ❌  |  |  |
| `statements` | Array of [`#deliberationStatement`](#deliberationstatement) | ❌  |  |  |

---

<a name="deliberationstatement"></a>
### `deliberationStatement`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `creator` | `string` | ✅  |  | Format: `did` |
| `proposal` | `string` | ✅  |  | Format: `at-uri` |
| `body` | `string` | ✅  |  | Max Length: 10000 |
| `stance` | `string` | ✅  |  | Max Length: 100 |
| `agreeCount` | `integer` | ✅  |  | Min: 0 |
| `disagreeCount` | `integer` | ✅  |  | Min: 0 |
| `passCount` | `integer` | ✅  |  | Min: 0 |
| `viewerDirection` | `string` | ❌  | How the requesting viewer already weighed this argument, if they did. Absent for a logged-out viewer. | Known Values: `agree`, `disagree`, `pass` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.listDeliberations",
  "defs": {
    "main": {
      "type": "query",
      "description": "List deliberation statements for a proposal.",
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
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
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
          "properties": {
            "cursor": {
              "type": "string"
            },
            "statements": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#deliberationStatement"
              }
            }
          }
        }
      }
    },
    "deliberationStatement": {
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
          "type": "string",
          "maxLength": 10000
        },
        "stance": {
          "type": "string",
          "maxLength": 100
        },
        "agreeCount": {
          "type": "integer",
          "minimum": 0
        },
        "disagreeCount": {
          "type": "integer",
          "minimum": 0
        },
        "passCount": {
          "type": "integer",
          "minimum": 0
        },
        "viewerDirection": {
          "type": "string",
          "knownValues": [
            "agree",
            "disagree",
            "pass"
          ],
          "description": "How the requesting viewer already weighed this argument, if they did. Absent for a logged-out viewer."
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
