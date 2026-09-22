---
title: com.para.discourse.getTopics
description: Reference for the com.para.discourse.getTopics lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Identify emerging clusters and topics within a community discourse.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `limit` | `integer` | ❌  |  | Default: `10` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `topics` | Array of [`#topic`](#topic) | ✅  |  |  |

---

<a name="topic"></a>
### `topic`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `label` | `string` | ✅  |  |  |
| `weight` | `integer` | ✅  | Relative importance/frequency (0-100) |  |
| `growthRate` | `integer` | ✅  | Percentage change in mentions over the last period |  |
| `relatedKeywords` | Array of `string` | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.discourse.getTopics",
  "defs": {
    "main": {
      "type": "query",
      "description": "Identify emerging clusters and topics within a community discourse.",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "limit": {
            "type": "integer",
            "default": 10
          }
        },
        "required": [
          "community"
        ]
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "topics"
          ],
          "properties": {
            "topics": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#topic"
              }
            }
          }
        }
      }
    },
    "topic": {
      "type": "object",
      "required": [
        "label",
        "weight",
        "growthRate"
      ],
      "properties": {
        "label": {
          "type": "string"
        },
        "weight": {
          "type": "integer",
          "description": "Relative importance/frequency (0-100)"
        },
        "growthRate": {
          "type": "integer",
          "description": "Percentage change in mentions over the last period"
        },
        "relatedKeywords": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
```
