---
title: com.para.community.civicTree.createRelationship
description: Reference for the com.para.community.civicTree.createRelationship lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `sourceCardId` | `string` | ✅  |  |  |
| `targetCardId` | `string` | ✅  |  |  |
| `relationshipType` | `string` | ✅  |  | Max Length: 64 |
| `authorDid` | `string` | ✅  |  | Format: `did` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `relationship` | [`com.para.community.civicTree.defs#relationshipView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#relationshipView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.createRelationship",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "communityUri",
            "sourceCardId",
            "targetCardId",
            "relationshipType",
            "authorDid"
          ],
          "properties": {
            "communityUri": {
              "type": "string",
              "format": "at-uri"
            },
            "sourceCardId": {
              "type": "string"
            },
            "targetCardId": {
              "type": "string"
            },
            "relationshipType": {
              "type": "string",
              "maxLength": 64
            },
            "authorDid": {
              "type": "string",
              "format": "did"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "relationship"
          ],
          "properties": {
            "relationship": {
              "type": "ref",
              "ref": "com.para.community.civicTree.defs#relationshipView"
            }
          }
        }
      }
    }
  }
}
```
