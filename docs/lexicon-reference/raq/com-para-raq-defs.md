---
title: com.para.raq.defs
description: Reference for the com.para.raq.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="axisresult"></a>
### `axisResult`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `axisId` | `string` | ✅  |  | Max Length: 64 |
| `axisTitle` | `string` | ✅  |  | Max Length: 128 |
| `score` | `integer` | ✅  |  | Min: 0<br/>Max: 100 |
| `label` | `string` | ✅  |  | Max Length: 64 |
| `labelLow` | `string` | ❌  |  | Max Length: 64 |
| `labelHigh` | `string` | ❌  |  | Max Length: 64 |
| `rawScore` | `integer` | ❌  |  |  |

---

<a name="ideologymatch"></a>
### `ideologyMatch`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `name` | `string` | ✅  |  | Max Length: 128 |
| `description` | `string` | ✅  |  | Max Length: 1000 |
| `matchPercent` | `integer` | ✅  |  | Min: 0<br/>Max: 100 |

---

<a name="partymatch"></a>
### `partyMatch`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `partyId` | `string` | ✅  |  | Max Length: 64 |
| `partyName` | `string` | ✅  |  | Max Length: 128 |
| `partyFullName` | `string` | ❌  |  | Max Length: 256 |
| `partyColor` | `string` | ❌  |  | Max Length: 32 |
| `matchPercent` | `integer` | ✅  |  | Min: 0<br/>Max: 100 |

---

<a name="compassposition"></a>
### `compassPosition`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `x` | `integer` | ✅  | Scaled by 1000, e.g. -500 = -0.5 | Min: -1000<br/>Max: 1000 |
| `y` | `integer` | ✅  | Scaled by 1000, e.g. 750 = 0.75 | Min: -1000<br/>Max: 1000 |
| `ninth` | `string` | ✅  |  | Max Length: 64 |

---

<a name="communityaxisview"></a>
### `communityAxisView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  | Max Length: 64 |
| `name` | `string` | ✅  |  | Max Length: 128 |
| `description` | `string` | ✅  |  | Max Length: 512 |
| `color` | `string` | ❌  |  | Max Length: 32 |
| `votes` | `integer` | ✅  |  | Min: 0 |
| `author` | `string` | ❌  |  | Format: `did` |
| `viewerHasVoted` | `boolean` | ❌  |  |  |

---

<a name="proposedquestionview"></a>
### `proposedQuestionView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  | Max Length: 64 |
| `text` | `string` | ✅  |  | Max Length: 1000 |
| `targetCommunity` | `string` | ❌  |  | Max Length: 128 |
| `upvotes` | `integer` | ✅  |  | Min: 0 |
| `downvotes` | `integer` | ✅  |  | Min: 0 |
| `isMainstream` | `boolean` | ✅  |  |  |
| `viewerHasUpvoted` | `boolean` | ❌  |  |  |
| `viewerHasDownvoted` | `boolean` | ❌  |  |  |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |
| `creator` | `string` | ❌  |  | Format: `did` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.defs",
  "defs": {
    "axisResult": {
      "type": "object",
      "required": [
        "axisId",
        "axisTitle",
        "score",
        "label"
      ],
      "properties": {
        "axisId": {
          "type": "string",
          "maxLength": 64
        },
        "axisTitle": {
          "type": "string",
          "maxLength": 128
        },
        "score": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "label": {
          "type": "string",
          "maxLength": 64
        },
        "labelLow": {
          "type": "string",
          "maxLength": 64
        },
        "labelHigh": {
          "type": "string",
          "maxLength": 64
        },
        "rawScore": {
          "type": "integer"
        }
      }
    },
    "ideologyMatch": {
      "type": "object",
      "required": [
        "name",
        "description",
        "matchPercent"
      ],
      "properties": {
        "name": {
          "type": "string",
          "maxLength": 128
        },
        "description": {
          "type": "string",
          "maxLength": 1000
        },
        "matchPercent": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        }
      }
    },
    "partyMatch": {
      "type": "object",
      "required": [
        "partyId",
        "partyName",
        "matchPercent"
      ],
      "properties": {
        "partyId": {
          "type": "string",
          "maxLength": 64
        },
        "partyName": {
          "type": "string",
          "maxLength": 128
        },
        "partyFullName": {
          "type": "string",
          "maxLength": 256
        },
        "partyColor": {
          "type": "string",
          "maxLength": 32
        },
        "matchPercent": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        }
      }
    },
    "compassPosition": {
      "type": "object",
      "required": [
        "x",
        "y",
        "ninth"
      ],
      "properties": {
        "x": {
          "type": "integer",
          "minimum": -1000,
          "maximum": 1000,
          "description": "Scaled by 1000, e.g. -500 = -0.5"
        },
        "y": {
          "type": "integer",
          "minimum": -1000,
          "maximum": 1000,
          "description": "Scaled by 1000, e.g. 750 = 0.75"
        },
        "ninth": {
          "type": "string",
          "maxLength": 64
        }
      }
    },
    "communityAxisView": {
      "type": "object",
      "required": [
        "id",
        "name",
        "description",
        "votes"
      ],
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 64
        },
        "name": {
          "type": "string",
          "maxLength": 128
        },
        "description": {
          "type": "string",
          "maxLength": 512
        },
        "color": {
          "type": "string",
          "maxLength": 32
        },
        "votes": {
          "type": "integer",
          "minimum": 0
        },
        "author": {
          "type": "string",
          "format": "did"
        },
        "viewerHasVoted": {
          "type": "boolean"
        }
      }
    },
    "proposedQuestionView": {
      "type": "object",
      "required": [
        "id",
        "text",
        "upvotes",
        "downvotes",
        "isMainstream"
      ],
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 64
        },
        "text": {
          "type": "string",
          "maxLength": 1000
        },
        "targetCommunity": {
          "type": "string",
          "maxLength": 128
        },
        "upvotes": {
          "type": "integer",
          "minimum": 0
        },
        "downvotes": {
          "type": "integer",
          "minimum": 0
        },
        "isMainstream": {
          "type": "boolean"
        },
        "viewerHasUpvoted": {
          "type": "boolean"
        },
        "viewerHasDownvoted": {
          "type": "boolean"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "creator": {
          "type": "string",
          "format": "did"
        }
      }
    }
  }
}
```
