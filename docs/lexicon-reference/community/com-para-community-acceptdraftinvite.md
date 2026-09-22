---
title: com.para.community.acceptDraftInvite
description: Reference for the com.para.community.acceptDraftInvite lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Accepts an invitation to a draft community, adding the caller to the community's founder starter pack and tracking the quorum. The PDS proxies the listitem creation for the starter pack.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `status` | `string` | ✅  |  |  |
| `memberCount` | `integer` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.acceptDraftInvite",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Accepts an invitation to a draft community, adding the caller to the community's founder starter pack and tracking the quorum. The PDS proxies the listitem creation for the starter pack.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "communityUri"
          ],
          "properties": {
            "communityUri": {
              "type": "string",
              "format": "at-uri"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "status",
            "memberCount"
          ],
          "properties": {
            "status": {
              "type": "string"
            },
            "memberCount": {
              "type": "integer"
            }
          }
        }
      }
    }
  }
}
```
