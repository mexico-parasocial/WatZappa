---
title: com.para.discourse.getAnalysis
description: Reference for the com.para.discourse.getAnalysis lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Perform state-of-the-art Aspect-Based Sentiment Analysis (ABSA) powered by models like PyABSA.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  | The Cabildeo or Community to analyze. | Format: `at-uri` |
| `timeframe` | `string` | ❌  |  | Enum: `1h`, `24h`, `7d`, `30d`, `all`<br/>Default: `all` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  |  | Format: `at-uri` |
| `aspects` | Array of [`#aspectAnalysis`](#aspectanalysis) | ✅  |  |  |
| `summary` | `string` | ❌  |  | Max Length: 5000 |
| `computedAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="sentimentdistribution"></a>
### `sentimentDistribution`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `strongPositive` | `integer` | ✅  | Percentage (0-100) |  |
| `positive` | `integer` | ✅  | Percentage (0-100) |  |
| `neutral` | `integer` | ✅  | Percentage (0-100) |  |
| `negative` | `integer` | ✅  | Percentage (0-100) |  |
| `strongNegative` | `integer` | ✅  | Percentage (0-100) |  |

---

<a name="aspectanalysis"></a>
### `aspectAnalysis`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `label` | `string` | ✅  | The specific feature or topic extracted (e.g., 'Costo de Obra', 'Impacto Ambiental'). |  |
| `count` | `integer` | ✅  | Total occurrences in the discourse. |  |
| `sentiment` | [`#sentimentDistribution`](#sentimentdistribution) | ✅  |  |  |
| `confidence` | `integer` | ✅  | Model confidence score for this aspect extraction. | Min: 0<br/>Max: 100 |
| `consensusScore` | `integer` | ✅  | How unified the community is on this specific aspect. | Min: 0<br/>Max: 100 |
| `summary` | `string` | ❌  |  | Max Length: 1000 |
| `sampleQuotes` | Array of `string` | ❌  |  | Max Items: 5 |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.discourse.getAnalysis",
  "defs": {
    "main": {
      "type": "query",
      "description": "Perform state-of-the-art Aspect-Based Sentiment Analysis (ABSA) powered by models like PyABSA.",
      "parameters": {
        "type": "params",
        "properties": {
          "subject": {
            "type": "string",
            "format": "at-uri",
            "description": "The Cabildeo or Community to analyze."
          },
          "timeframe": {
            "type": "string",
            "enum": [
              "1h",
              "24h",
              "7d",
              "30d",
              "all"
            ],
            "default": "all"
          }
        },
        "required": [
          "subject"
        ]
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "subject",
            "aspects",
            "computedAt"
          ],
          "properties": {
            "subject": {
              "type": "string",
              "format": "at-uri"
            },
            "aspects": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#aspectAnalysis"
              }
            },
            "summary": {
              "type": "string",
              "maxLength": 5000
            },
            "computedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    },
    "sentimentDistribution": {
      "type": "object",
      "required": [
        "strongPositive",
        "positive",
        "neutral",
        "negative",
        "strongNegative"
      ],
      "properties": {
        "strongPositive": {
          "type": "integer",
          "description": "Percentage (0-100)"
        },
        "positive": {
          "type": "integer",
          "description": "Percentage (0-100)"
        },
        "neutral": {
          "type": "integer",
          "description": "Percentage (0-100)"
        },
        "negative": {
          "type": "integer",
          "description": "Percentage (0-100)"
        },
        "strongNegative": {
          "type": "integer",
          "description": "Percentage (0-100)"
        }
      }
    },
    "aspectAnalysis": {
      "type": "object",
      "required": [
        "label",
        "sentiment",
        "count",
        "confidence",
        "consensusScore"
      ],
      "properties": {
        "label": {
          "type": "string",
          "description": "The specific feature or topic extracted (e.g., 'Costo de Obra', 'Impacto Ambiental')."
        },
        "count": {
          "type": "integer",
          "description": "Total occurrences in the discourse."
        },
        "sentiment": {
          "type": "ref",
          "ref": "#sentimentDistribution"
        },
        "confidence": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "Model confidence score for this aspect extraction."
        },
        "consensusScore": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "How unified the community is on this specific aspect."
        },
        "summary": {
          "type": "string",
          "maxLength": 1000
        },
        "sampleQuotes": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 500
          },
          "maxLength": 5
        }
      }
    }
  }
}
```
