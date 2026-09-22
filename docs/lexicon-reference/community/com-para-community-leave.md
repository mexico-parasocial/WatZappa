---
title: com.para.community.leave
description: Reference for the com.para.community.leave lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Leaves a PARA community board by marking the caller's membership record as left.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `communityUri` | `string` | ✅  | URI of the com.para.community.board record to leave. | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** [`#output`](#output)



---

<a name="output"></a>
### `output`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `membershipState` | `string` | ✅  |  | Known Values: `pending`, `active`, `left`, `removed`, `blocked` |
| `viewerCapabilities` | Array of `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.leave",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Leaves a PARA community board by marking the caller's membership record as left.",
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
              "format": "at-uri",
              "description": "URI of the com.para.community.board record to leave."
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "#output"
        }
      }
    },
    "output": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "communityUri",
        "membershipState",
        "viewerCapabilities"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "communityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "membershipState": {
          "type": "string",
          "knownValues": [
            "pending",
            "active",
            "left",
            "removed",
            "blocked"
          ]
        },
        "viewerCapabilities": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        }
      }
    }
  }
}
```
