---
title: com.para.community.board
description: Reference for the com.para.community.board lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A repository record acting as the anchor for a PARA community, linking the spatial map quadrant to the underlying ATProto group chats.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `name` | `string` | ✅  |  | Min Length: 1<br/>Max Length: 1280<br/>Max Graphemes: 128 |
| `description` | `string` | ❌  |  | Max Length: 3000 |
| `quadrant` | `string` | ✅  | Spatial mapping token indicating the nonant or 25th block. | Max Length: 64 |
| `geo` | [`#geoPoint`](#geopoint) | ❌  |  |  |
| `delegatesChatId` | `string` | ✅  | Reference to the 270-member bounded bsky group chat. |  |
| `subdelegatesChatId` | `string` | ✅  | Reference to the 30-member bounded public-view bsky group chat. |  |
| `status` | `string` | ✅  | The lifecycle status of the community. | Known Values: `draft`, `active` |
| `founderStarterPackUri` | `string` | ❌  | Reference to the starter pack used to track the founding member quorum. | Format: `at-uri` |
| `visibility` | `string` | ❌  | Visibility of the community. | Known Values: `open`, `closed`, `secret`<br/>Default: `open` |
| `chamberMode` | `string` | ❌  | Deliberation structure. | Known Values: `unicameral`, `bicameral`<br/>Default: `unicameral` |
| `governanceMode` | `string` | ❌  | Governance model for this community. | Known Values: `hierarchical`, `horizontal`<br/>Default: `hierarchical` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

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
  "id": "com.para.community.board",
  "defs": {
    "main": {
      "type": "record",
      "description": "A repository record acting as the anchor for a PARA community, linking the spatial map quadrant to the underlying ATProto group chats.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "name",
          "quadrant",
          "delegatesChatId",
          "subdelegatesChatId",
          "createdAt",
          "status"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxGraphemes": 128,
            "maxLength": 1280
          },
          "description": {
            "type": "string",
            "maxLength": 3000
          },
          "quadrant": {
            "type": "string",
            "description": "Spatial mapping token indicating the nonant or 25th block.",
            "maxLength": 64
          },
          "geo": {
            "type": "ref",
            "ref": "#geoPoint"
          },
          "delegatesChatId": {
            "type": "string",
            "description": "Reference to the 270-member bounded bsky group chat."
          },
          "subdelegatesChatId": {
            "type": "string",
            "description": "Reference to the 30-member bounded public-view bsky group chat."
          },
          "status": {
            "type": "string",
            "description": "The lifecycle status of the community.",
            "knownValues": [
              "draft",
              "active"
            ]
          },
          "founderStarterPackUri": {
            "type": "string",
            "format": "at-uri",
            "description": "Reference to the starter pack used to track the founding member quorum."
          },
          "visibility": {
            "type": "string",
            "description": "Visibility of the community.",
            "knownValues": [
              "open",
              "closed",
              "secret"
            ],
            "default": "open"
          },
          "chamberMode": {
            "type": "string",
            "description": "Deliberation structure.",
            "knownValues": [
              "unicameral",
              "bicameral"
            ],
            "default": "unicameral"
          },
          "governanceMode": {
            "type": "string",
            "description": "Governance model for this community.",
            "knownValues": [
              "hierarchical",
              "horizontal"
            ],
            "default": "hierarchical"
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
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
