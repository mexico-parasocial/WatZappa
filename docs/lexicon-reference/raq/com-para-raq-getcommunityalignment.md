---
title: com.para.raq.getCommunityAlignment
description: Reference for the com.para.raq.getCommunityAlignment lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get the aggregate RAQ alignment for a community.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ✅  |  | Max Length: 100 |
| `limit` | `integer` | ❌  |  | Min: 1<br/>Max: 100<br/>Default: `20` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `axes` | Array of [`com.para.raq.defs#axisResult`]([[com-para-raq-defs|com.para.raq.defs#axisResult]]) | ✅  |  |  |
| `compass` | [`com.para.raq.defs#compassPosition`]([[com-para-raq-defs|com.para.raq.defs#compassPosition]]) | ❌  |  |  |
| `participantCount` | `integer` | ❌  |  | Min: 0 |
| `cursor` | `string` | ❌  |  |  |
**Possible Errors:**

- `NotFound`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.getCommunityAlignment",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get the aggregate RAQ alignment for a community.",
      "parameters": {
        "type": "params",
        "required": [
          "community"
        ],
        "properties": {
          "community": {
            "type": "string",
            "maxLength": 100
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 20
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "axes"
          ],
          "properties": {
            "axes": {
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
            "participantCount": {
              "type": "integer",
              "minimum": 0
            },
            "cursor": {
              "type": "string"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        }
      ]
    }
  }
}
```
