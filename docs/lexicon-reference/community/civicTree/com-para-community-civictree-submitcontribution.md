---
title: com.para.community.civicTree.submitContribution
description: Reference for the com.para.community.civicTree.submitContribution lexicon
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
| `authorDid` | `string` | ✅  |  | Format: `did` |
| `title` | `string` | ✅  |  | Max Length: 500 |
| `content` | `string` | ❌  |  | Max Length: 10000 |
| `sourceUri` | `string` | ❌  |  | Format: `at-uri` |
| `sourceUrl` | `string` | ❌  |  | Format: `uri` |
| `sourceType` | `string` | ✅  |  | Max Length: 64 |
| `metadata` | `string` | ❌  |  | Max Length: 20000 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `contribution` | [`com.para.community.civicTree.defs#contributionView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#contributionView]]) | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.submitContribution",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "communityUri",
            "authorDid",
            "title",
            "sourceType"
          ],
          "properties": {
            "communityUri": {
              "type": "string",
              "format": "at-uri"
            },
            "authorDid": {
              "type": "string",
              "format": "did"
            },
            "title": {
              "type": "string",
              "maxLength": 500
            },
            "content": {
              "type": "string",
              "maxLength": 10000
            },
            "sourceUri": {
              "type": "string",
              "format": "at-uri"
            },
            "sourceUrl": {
              "type": "string",
              "format": "uri"
            },
            "sourceType": {
              "type": "string",
              "maxLength": 64
            },
            "metadata": {
              "type": "string",
              "maxLength": 20000
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "contribution"
          ],
          "properties": {
            "contribution": {
              "type": "ref",
              "ref": "com.para.community.civicTree.defs#contributionView"
            }
          }
        }
      }
    }
  }
}
```
