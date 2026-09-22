---
title: com.para.civic.castVote
description: Reference for the com.para.civic.castVote lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Cast or replace the viewer's direct vote for a cabildeo.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `selectedOption` | `integer` | ✅  |  | Min: 0 |
| `voteNullifier` | `string` | ❌  | One-person-one-vote nullifier for this cabildeo, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. | Max Length: 128 |
| `eligibilityProofRef` | `string` | ❌  | Opaque m8 proof reference for the vote nullifier. | Max Length: 512 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `commit` | [`#commit`](#commit) | ✅  |  |  |
**Possible Errors:**

- `NotFound`
- `InvalidPhase`
- `DeadlineExpired`
- `InvalidOption`
- `VoteEditWindowExpired`
- `CommunityMembershipRequired`

---

<a name="commit"></a>
### `commit`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cid` | `string` | ✅  |  | Format: `cid` |
| `rev` | `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.castVote",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Cast or replace the viewer's direct vote for a cabildeo.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "cabildeo",
            "selectedOption"
          ],
          "properties": {
            "cabildeo": {
              "type": "string",
              "format": "at-uri"
            },
            "selectedOption": {
              "type": "integer",
              "minimum": 0
            },
            "voteNullifier": {
              "type": "string",
              "maxLength": 128,
              "description": "One-person-one-vote nullifier for this cabildeo, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a."
            },
            "eligibilityProofRef": {
              "type": "string",
              "maxLength": 512,
              "description": "Opaque m8 proof reference for the vote nullifier."
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "uri",
            "cid",
            "commit"
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
            "commit": {
              "type": "ref",
              "ref": "#commit"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        },
        {
          "name": "InvalidPhase"
        },
        {
          "name": "DeadlineExpired"
        },
        {
          "name": "InvalidOption"
        },
        {
          "name": "VoteEditWindowExpired"
        },
        {
          "name": "CommunityMembershipRequired"
        }
      ]
    },
    "commit": {
      "type": "object",
      "required": [
        "cid",
        "rev"
      ],
      "properties": {
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "rev": {
          "type": "string"
        }
      }
    }
  }
}
```
