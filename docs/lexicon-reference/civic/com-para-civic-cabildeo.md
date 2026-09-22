---
title: com.para.civic.cabildeo
description: Reference for the com.para.civic.cabildeo lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A structured civic deliberation proposal.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `title` | `string` | ✅  |  | Max Length: 300 |
| `description` | `string` | ✅  |  | Max Length: 30000 |
| `community` | `string` | ✅  |  | Max Length: 100 |
| `communities` | Array of `string` | ❌  |  | Max Items: 10 |
| `flairs` | Array of `string` | ❌  |  | Max Items: 10 |
| `region` | `string` | ❌  |  | Max Length: 100 |
| `geoRestricted` | `boolean` | ❌  |  |  |
| `geo` | [`#geoPoint`](#geopoint) | ❌  |  |  |
| `geoScope` | `string` | ❌  | Precision tier the author chose. The indexer never stores more precision than the scope allows. | Known Values: `state`, `district`, `city`, `neighborhood` |
| `options` | Array of [`#cabildeoOption`](#cabildeooption) | ✅  |  | Max Items: 10 |
| `minQuorum` | `integer` | ❌  |  | Min: 1 |
| `minimumViewTier` | `string` | ❌  | Minimum tier required to view the cabildeo. Existing records default to public. | Known Values: `public`, `signed_in`, `verified_human`, `verified_area`, `community_member`, `delegate`, `official_controller` |
| `minimumParticipationTier` | `string` | ❌  | Minimum tier required to vote, delegate, or publish a position. Existing records default to signed_in. | Known Values: `public`, `signed_in`, `verified_human`, `verified_area`, `community_member`, `delegate`, `official_controller` |
| `voteVisibility` | `string` | ❌  | Controls how voter identity is exposed. Existing records default to public. | Known Values: `public`, `party_only`, `anonymous` |
| `phase` | `string` | ✅  |  | Known Values: `draft`, `open`, `deliberating`, `voting`, `resolved` |
| `phaseDeadline` | `string` | ❌  |  | Format: `datetime` |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

<a name="cabildeooption"></a>
### `cabildeoOption`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `label` | `string` | ✅  |  | Max Length: 100 |
| `description` | `string` | ❌  |  | Max Length: 500 |

---

<a name="geopoint"></a>
### `geoPoint`

**Type:** `object`

Geographic coordinates in E7 (degrees × 10⁷) for map placement.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `latE7` | `integer` | ✅  |  | Min: -900000000<br/>Max: 900000000 |
| `lngE7` | `integer` | ✅  |  | Min: -1800000000<br/>Max: 1800000000 |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.cabildeo",
  "defs": {
    "main": {
      "type": "record",
      "description": "A structured civic deliberation proposal.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "title",
          "description",
          "community",
          "options",
          "phase"
        ],
        "properties": {
          "title": {
            "type": "string",
            "maxLength": 300
          },
          "description": {
            "type": "string",
            "maxLength": 30000
          },
          "community": {
            "type": "string",
            "maxLength": 100
          },
          "communities": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 100
            },
            "maxLength": 10
          },
          "flairs": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 100
            },
            "maxLength": 10
          },
          "region": {
            "type": "string",
            "maxLength": 100
          },
          "geoRestricted": {
            "type": "boolean"
          },
          "geo": {
            "type": "ref",
            "ref": "#geoPoint"
          },
          "geoScope": {
            "type": "string",
            "knownValues": [
              "state",
              "district",
              "city",
              "neighborhood"
            ],
            "description": "Precision tier the author chose. The indexer never stores more precision than the scope allows."
          },
          "options": {
            "type": "array",
            "items": {
              "type": "ref",
              "ref": "#cabildeoOption"
            },
            "maxLength": 10
          },
          "minQuorum": {
            "type": "integer",
            "minimum": 1
          },
          "minimumViewTier": {
            "type": "string",
            "knownValues": [
              "public",
              "signed_in",
              "verified_human",
              "verified_area",
              "community_member",
              "delegate",
              "official_controller"
            ],
            "description": "Minimum tier required to view the cabildeo. Existing records default to public."
          },
          "minimumParticipationTier": {
            "type": "string",
            "knownValues": [
              "public",
              "signed_in",
              "verified_human",
              "verified_area",
              "community_member",
              "delegate",
              "official_controller"
            ],
            "description": "Minimum tier required to vote, delegate, or publish a position. Existing records default to signed_in."
          },
          "voteVisibility": {
            "type": "string",
            "knownValues": [
              "public",
              "party_only",
              "anonymous"
            ],
            "description": "Controls how voter identity is exposed. Existing records default to public."
          },
          "phase": {
            "type": "string",
            "knownValues": [
              "draft",
              "open",
              "deliberating",
              "voting",
              "resolved"
            ]
          },
          "phaseDeadline": {
            "type": "string",
            "format": "datetime"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    },
    "cabildeoOption": {
      "type": "object",
      "required": [
        "label"
      ],
      "properties": {
        "label": {
          "type": "string",
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "maxLength": 500
        }
      }
    },
    "geoPoint": {
      "type": "object",
      "description": "Geographic coordinates in E7 (degrees × 10⁷) for map placement.",
      "required": [
        "latE7",
        "lngE7"
      ],
      "properties": {
        "latE7": {
          "type": "integer",
          "minimum": -900000000,
          "maximum": 900000000
        },
        "lngE7": {
          "type": "integer",
          "minimum": -1800000000,
          "maximum": 1800000000
        }
      }
    }
  }
}
```
