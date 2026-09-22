---
title: com.para.community.civicTreeVote
description: Reference for the com.para.community.civicTreeVote lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `civicTree` | `string` | ✅  |  | Format: `at-uri` |
| `voter` | `string` | ✅  |  | Format: `did` |
| `direction` | `string` | ✅  |  | Enum: `agree`, `disagree`, `pass` |
| `voteNullifier` | `string` | ❌  | One-person-one-vote nullifier for this civicTree statement, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. | Max Length: 128 |
| `eligibilityProofRef` | `string` | ❌  | Opaque reference to the m8 eligibility/nullifier proof used to cast this vote. | Max Length: 512 |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTreeVote",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "civicTree",
          "voter",
          "direction"
        ],
        "properties": {
          "civicTree": {
            "type": "string",
            "format": "at-uri"
          },
          "voter": {
            "type": "string",
            "format": "did"
          },
          "direction": {
            "type": "string",
            "enum": [
              "agree",
              "disagree",
              "pass"
            ]
          },
          "voteNullifier": {
            "type": "string",
            "maxLength": 128,
            "description": "One-person-one-vote nullifier for this civicTree statement, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a."
          },
          "eligibilityProofRef": {
            "type": "string",
            "maxLength": 512,
            "description": "Opaque reference to the m8 eligibility/nullifier proof used to cast this vote."
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
