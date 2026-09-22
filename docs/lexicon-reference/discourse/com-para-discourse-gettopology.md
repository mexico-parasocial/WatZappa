---
title: com.para.discourse.getTopology
description: Reference for the com.para.discourse.getTopology lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get structural discourse topology for a community or the global network. Replaces ambiguous emotional sentiment with ideologically-grounded, auditable metrics.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community` | `string` | ❌  | Community identifier. Omit for global/network-wide topology. |  |
| `timeframe` | `string` | ❌  |  | Enum: `1h`, `24h`, `7d`, `30d`<br/>Default: `7d` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `topology` | [`#discourseTopology`](#discoursetopology) | ✅  |  |  |

---

<a name="discoursetopology"></a>
### `discourseTopology`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `ideologicalCentroid` | [`#ideologicalCentroid`](#ideologicalcentroid) | ✅  |  |  |
| `ideologicalSpread` | `integer` | ✅  | How dispersed the discourse is across the compass (0 = monoculture, 100 = maximally diverse). | Min: 0<br/>Max: 100 |
| `crossCompassEngagement` | `integer` | ✅  | Percentage of interactions (replies, votes, relationships) that cross compass quadrants. | Min: 0<br/>Max: 100 |
| `positionDensity` | [`#positionDensity`](#positiondensity) | ✅  |  |  |
| `contestedAxes` | Array of [`#contestedAxis`](#contestedaxis) | ❌  | Top RAQ axes currently generating the most cross-position disagreement. |  |
| `argumentBalance` | [`#argumentBalance`](#argumentbalance) | ✅  |  |  |
| `bridgeOpportunities` | Array of [`#bridgeOpportunity`](#bridgeopportunity) | ❌  | Suggested points where different ideological positions might find common ground. |  |
| `proposalVelocity` | [`#proposalVelocity`](#proposalvelocity) | ✅  |  |  |

---

<a name="ideologicalcentroid"></a>
### `ideologicalCentroid`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `x` | `integer` | ✅  | Economic axis: -1000 (Market) to +1000 (Planning) | Min: -1000<br/>Max: 1000 |
| `y` | `integer` | ✅  | Authority axis: -1000 (Libertarian) to +1000 (Authoritarian) | Min: -1000<br/>Max: 1000 |

---

<a name="positiondensity"></a>
### `positionDensity`

**Type:** `object`

Participation density per compass position (0-100 each).

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `authLeft` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `authCenter` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `authRight` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `centerLeft` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `center` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `centerRight` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `libLeft` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `libCenter` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |
| `libRight` | `integer` | ❌  |  | Min: 0<br/>Max: 100 |

---

<a name="argumentbalance"></a>
### `argumentBalance`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `claims` | `integer` | ✅  |  | Min: 0 |
| `evidence` | `integer` | ✅  |  | Min: 0 |
| `questions` | `integer` | ✅  |  | Min: 0 |
| `rebuttals` | `integer` | ✅  |  | Min: 0 |

---

<a name="proposalvelocity"></a>
### `proposalVelocity`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposed` | `integer` | ✅  |  | Min: 0 |
| `deliberating` | `integer` | ✅  |  | Min: 0 |
| `voting` | `integer` | ✅  |  | Min: 0 |
| `resolved` | `integer` | ✅  |  | Min: 0 |

---

<a name="contestedaxis"></a>
### `contestedAxis`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `axisId` | `string` | ✅  |  |  |
| `axisTitle` | `string` | ✅  |  |  |
| `labelLow` | `string` | ✅  |  |  |
| `labelHigh` | `string` | ✅  |  |  |
| `discourseScore` | `integer` | ✅  | Where discourse leans on this axis (0 = low label, 100 = high label). | Min: 0<br/>Max: 100 |
| `engagementCount` | `integer` | ✅  |  | Min: 0 |

---

<a name="bridgeopportunity"></a>
### `bridgeOpportunity`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `description` | `string` | ✅  |  | Max Length: 500 |
| `topicOverlap` | Array of `string` | ✅  |  |  |
| `positionsInvolved` | Array of `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.discourse.getTopology",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get structural discourse topology for a community or the global network. Replaces ambiguous emotional sentiment with ideologically-grounded, auditable metrics.",
      "parameters": {
        "type": "params",
        "properties": {
          "community": {
            "type": "string",
            "description": "Community identifier. Omit for global/network-wide topology."
          },
          "timeframe": {
            "type": "string",
            "enum": [
              "1h",
              "24h",
              "7d",
              "30d"
            ],
            "default": "7d"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "topology"
          ],
          "properties": {
            "topology": {
              "type": "ref",
              "ref": "#discourseTopology"
            }
          }
        }
      }
    },
    "discourseTopology": {
      "type": "object",
      "required": [
        "ideologicalCentroid",
        "ideologicalSpread",
        "crossCompassEngagement",
        "positionDensity",
        "argumentBalance",
        "proposalVelocity"
      ],
      "properties": {
        "ideologicalCentroid": {
          "type": "ref",
          "ref": "#ideologicalCentroid"
        },
        "ideologicalSpread": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "How dispersed the discourse is across the compass (0 = monoculture, 100 = maximally diverse)."
        },
        "crossCompassEngagement": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "Percentage of interactions (replies, votes, relationships) that cross compass quadrants."
        },
        "positionDensity": {
          "type": "ref",
          "ref": "#positionDensity"
        },
        "contestedAxes": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#contestedAxis"
          },
          "description": "Top RAQ axes currently generating the most cross-position disagreement."
        },
        "argumentBalance": {
          "type": "ref",
          "ref": "#argumentBalance"
        },
        "bridgeOpportunities": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#bridgeOpportunity"
          },
          "description": "Suggested points where different ideological positions might find common ground."
        },
        "proposalVelocity": {
          "type": "ref",
          "ref": "#proposalVelocity"
        }
      }
    },
    "ideologicalCentroid": {
      "type": "object",
      "required": [
        "x",
        "y"
      ],
      "properties": {
        "x": {
          "type": "integer",
          "minimum": -1000,
          "maximum": 1000,
          "description": "Economic axis: -1000 (Market) to +1000 (Planning)"
        },
        "y": {
          "type": "integer",
          "minimum": -1000,
          "maximum": 1000,
          "description": "Authority axis: -1000 (Libertarian) to +1000 (Authoritarian)"
        }
      }
    },
    "positionDensity": {
      "type": "object",
      "description": "Participation density per compass position (0-100 each).",
      "properties": {
        "authLeft": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "authCenter": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "authRight": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "centerLeft": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "center": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "centerRight": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "libLeft": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "libCenter": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "libRight": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        }
      }
    },
    "argumentBalance": {
      "type": "object",
      "required": [
        "claims",
        "evidence",
        "questions",
        "rebuttals"
      ],
      "properties": {
        "claims": {
          "type": "integer",
          "minimum": 0
        },
        "evidence": {
          "type": "integer",
          "minimum": 0
        },
        "questions": {
          "type": "integer",
          "minimum": 0
        },
        "rebuttals": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "proposalVelocity": {
      "type": "object",
      "required": [
        "proposed",
        "deliberating",
        "voting",
        "resolved"
      ],
      "properties": {
        "proposed": {
          "type": "integer",
          "minimum": 0
        },
        "deliberating": {
          "type": "integer",
          "minimum": 0
        },
        "voting": {
          "type": "integer",
          "minimum": 0
        },
        "resolved": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "contestedAxis": {
      "type": "object",
      "required": [
        "axisId",
        "axisTitle",
        "labelLow",
        "labelHigh",
        "discourseScore",
        "engagementCount"
      ],
      "properties": {
        "axisId": {
          "type": "string"
        },
        "axisTitle": {
          "type": "string"
        },
        "labelLow": {
          "type": "string"
        },
        "labelHigh": {
          "type": "string"
        },
        "discourseScore": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100,
          "description": "Where discourse leans on this axis (0 = low label, 100 = high label)."
        },
        "engagementCount": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "bridgeOpportunity": {
      "type": "object",
      "required": [
        "description",
        "topicOverlap",
        "positionsInvolved"
      ],
      "properties": {
        "description": {
          "type": "string",
          "maxLength": 500
        },
        "topicOverlap": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "positionsInvolved": {
          "type": "array",
          "items": {
            "type": "string",
            "knownValues": [
              "auth-left",
              "auth-center",
              "auth-right",
              "center-left",
              "center",
              "center-right",
              "lib-left",
              "lib-center",
              "lib-right"
            ]
          }
        }
      }
    }
  }
}
```
