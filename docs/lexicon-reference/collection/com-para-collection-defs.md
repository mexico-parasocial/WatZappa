---
title: com.para.collection.defs
description: Reference for the com.para.collection.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="collection"></a>
### `collection`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `name` | `string` | ✅  |  | Max Length: 200 |
| `description` | `string` | ❌  |  | Max Length: 2000 |
| `color` | `string` | ❌  |  | Max Length: 7 |
| `items` | Array of [`#civicTreeItem`](#civictreeitem) | ✅  |  |  |
| `relations` | Array of [`#civicTreeRelation`](#civictreerelation) | ❌  |  |  |

---

<a name="civictreeitem"></a>
### `civicTreeItem`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `itemId` | `string` | ❌  |  | Max Length: 200 |
| `kind` | `string` | ❌  | What the item is. All kinds except `topic` reference an artifact with a URI or URL; a `topic` is a subject the artifacts are about, and carries no target of its own. | Known Values: `policy`, `post`, `link`, `note`, `evidence`, `topic` |
| `title` | `string` | ❌  |  | Max Length: 500 |
| `description` | `string` | ❌  |  | Max Length: 2000 |
| `url` | `string` | ❌  |  | Format: `uri`<br/>Max Length: 2000 |
| `sourceUri` | `string` | ❌  |  | Format: `at-uri` |
| `sourceLabel` | `string` | ❌  |  | Max Length: 500 |
| `policyUri` | `string` | ❌  |  | Format: `at-uri` |
| `policyCid` | `string` | ❌  |  | Format: `cid` |
| `policyTitle` | `string` | ❌  |  | Max Length: 500 |
| `policyCategory` | `string` | ❌  |  | Max Length: 200 |
| `policyColor` | `string` | ❌  |  | Max Length: 7 |
| `note` | `string` | ❌  |  | Max Length: 1000 |
| `addedAt` | `string` | ✅  |  | Format: `datetime` |
| `flairId` | `string` | ❌  | For a topic drawn from PARA's shared flair vocabulary, the flair id. Absent on a free-text topic. |  |

---

<a name="civictreerelation"></a>
### `civicTreeRelation`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  | Max Length: 200 |
| `fromItemId` | `string` | ✅  |  | Max Length: 200 |
| `toItemId` | `string` | ✅  |  | Max Length: 200 |
| `kind` | `string` | ✅  |  | Known Values: `supports`, `opposes`, `evidence_for`, `context_for`, `duplicates`, `depends_on`, `related_to` |
| `note` | `string` | ❌  |  | Max Length: 1000 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="collectionview"></a>
### `collectionView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `name` | `string` | ✅  |  |  |
| `description` | `string` | ❌  |  |  |
| `color` | `string` | ❌  |  |  |
| `items` | Array of [`#civicTreeItem`](#civictreeitem) | ✅  |  |  |
| `relations` | Array of [`#civicTreeRelation`](#civictreerelation) | ❌  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `updatedAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.collection.defs",
  "defs": {
    "collection": {
      "type": "object",
      "required": [
        "id",
        "name",
        "items"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        },
        "description": {
          "type": "string",
          "maxLength": 2000
        },
        "color": {
          "type": "string",
          "maxLength": 7
        },
        "items": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#civicTreeItem"
          }
        },
        "relations": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#civicTreeRelation"
          }
        }
      }
    },
    "civicTreeItem": {
      "type": "object",
      "required": [
        "addedAt"
      ],
      "properties": {
        "itemId": {
          "type": "string",
          "maxLength": 200
        },
        "kind": {
          "type": "string",
          "knownValues": [
            "policy",
            "post",
            "link",
            "note",
            "evidence",
            "topic"
          ],
          "description": "What the item is. All kinds except `topic` reference an artifact with a URI or URL; a `topic` is a subject the artifacts are about, and carries no target of its own."
        },
        "title": {
          "type": "string",
          "maxLength": 500
        },
        "description": {
          "type": "string",
          "maxLength": 2000
        },
        "url": {
          "type": "string",
          "format": "uri",
          "maxLength": 2000
        },
        "sourceUri": {
          "type": "string",
          "format": "at-uri"
        },
        "sourceLabel": {
          "type": "string",
          "maxLength": 500
        },
        "policyUri": {
          "type": "string",
          "format": "at-uri"
        },
        "policyCid": {
          "type": "string",
          "format": "cid"
        },
        "policyTitle": {
          "type": "string",
          "maxLength": 500
        },
        "policyCategory": {
          "type": "string",
          "maxLength": 200
        },
        "policyColor": {
          "type": "string",
          "maxLength": 7
        },
        "note": {
          "type": "string",
          "maxLength": 1000
        },
        "addedAt": {
          "type": "string",
          "format": "datetime"
        },
        "flairId": {
          "type": "string",
          "description": "For a topic drawn from PARA's shared flair vocabulary, the flair id. Absent on a free-text topic."
        }
      }
    },
    "civicTreeRelation": {
      "type": "object",
      "required": [
        "id",
        "fromItemId",
        "toItemId",
        "kind",
        "createdAt"
      ],
      "properties": {
        "id": {
          "type": "string",
          "maxLength": 200
        },
        "fromItemId": {
          "type": "string",
          "maxLength": 200
        },
        "toItemId": {
          "type": "string",
          "maxLength": 200
        },
        "kind": {
          "type": "string",
          "knownValues": [
            "supports",
            "opposes",
            "evidence_for",
            "context_for",
            "duplicates",
            "depends_on",
            "related_to"
          ]
        },
        "note": {
          "type": "string",
          "maxLength": 1000
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "collectionView": {
      "type": "object",
      "required": [
        "id",
        "name",
        "items",
        "createdAt",
        "updatedAt"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "color": {
          "type": "string"
        },
        "items": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#civicTreeItem"
          }
        },
        "relations": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#civicTreeRelation"
          }
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "updatedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
