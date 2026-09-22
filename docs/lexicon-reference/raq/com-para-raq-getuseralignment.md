---
title: com.para.raq.getUserAlignment
description: Reference for the com.para.raq.getUserAlignment lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get a user's public RAQ alignment.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ✅  |  | Format: `did` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `assessment` | [`#assessmentView`](#assessmentview) | ✅  |  |  |
**Possible Errors:**

- `NotFound`

---

<a name="assessmentview"></a>
### `assessmentView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `results` | Array of [`com.para.raq.defs#axisResult`]([[com-para-raq-defs|com.para.raq.defs#axisResult]]) | ✅  |  |  |
| `compass` | [`com.para.raq.defs#compassPosition`]([[com-para-raq-defs|com.para.raq.defs#compassPosition]]) | ✅  |  |  |
| `ideology` | [`com.para.raq.defs#ideologyMatch`]([[com-para-raq-defs|com.para.raq.defs#ideologyMatch]]) | ✅  |  |  |
| `secondaryIdeology` | [`com.para.raq.defs#ideologyMatch`]([[com-para-raq-defs|com.para.raq.defs#ideologyMatch]]) | ❌  |  |  |
| `partyMatches` | Array of [`com.para.raq.defs#partyMatch`]([[com-para-raq-defs|com.para.raq.defs#partyMatch]]) | ❌  |  |  |
| `completedAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.getUserAlignment",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a user's public RAQ alignment.",
      "parameters": {
        "type": "params",
        "required": [
          "did"
        ],
        "properties": {
          "did": {
            "type": "string",
            "format": "did"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "assessment"
          ],
          "properties": {
            "assessment": {
              "type": "ref",
              "ref": "#assessmentView"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        }
      ]
    },
    "assessmentView": {
      "type": "object",
      "required": [
        "results",
        "compass",
        "ideology"
      ],
      "properties": {
        "results": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.raq.defs#axisResult"
          }
        },
        "compass": {
          "type": "ref",
          "ref": "com.para.raq.defs#compassPosition"
        },
        "ideology": {
          "type": "ref",
          "ref": "com.para.raq.defs#ideologyMatch"
        },
        "secondaryIdeology": {
          "type": "ref",
          "ref": "com.para.raq.defs#ideologyMatch"
        },
        "partyMatches": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.raq.defs#partyMatch"
          }
        },
        "completedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
