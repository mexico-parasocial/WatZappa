---
title: com.para.community.intensity
description: Reference for the com.para.community.intensity lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

DEPRECATED 2026-09-18 (ballot freeze E0). Do not write this record. It carries everything com.para.community.vote does plus `units`, `creditsSpent`, `effectiveWeight` and `delegatedFrom` — the delegation graph, which OD-7 §5b names as more re-identifying than the ballots themselves — all in the voter's own public repo. Quadratic intensity is the last stage of the replacement design, not the first: see WatZappa/docs/OD-7-BALLOT-IDENTITY-REGISTRATION.md §5a.3/§5b.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposal` | `string` | ✅  | URI of the proposal this intensity declaration applies to | Format: `at-uri` |
| `voter` | `string` | ✅  | DID of the voter making this intensity declaration | Format: `did` |
| `signal` | `integer` | ✅  | Signal direction, must match the base vote record | Min: -3<br/>Max: 3 |
| `units` | `integer` | ✅  | Quadratic voice credits allocated. 1=1², 4=2², 9=3², 16=4². Maps to intensity level 1-4. | Min: 1<br/>Max: 16 |
| `creditsSpent` | `integer` | ❌  | Same as units, explicit alias for clarity in audit trails |  |
| `delegatedFrom` | Array of `string` | ❌  | DIDs whose voting power was aggregated into this intensity record. Empty = direct. |  |
| `delegationDepth` | `integer` | ❌  | 0 = direct, 1 = one hop. Max 1 in PARA QV-LD. |  |
| `effectiveWeight` | `string` | ❌  | Computed effective weight after QV sqrt and correlation discounting. Stored for audit trail. |  |
| `voteNullifier` | `string` | ❌  | One-person-one-vote nullifier for this proposal intensity declaration, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. | Max Length: 128 |
| `eligibilityProofRef` | `string` | ❌  | Opaque reference to the m8 eligibility/nullifier proof used to cast this intensity declaration. | Max Length: 512 |
| `createdAt` | `string` | ❌  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.intensity",
  "defs": {
    "main": {
      "type": "record",
      "description": "DEPRECATED 2026-09-18 (ballot freeze E0). Do not write this record. It carries everything com.para.community.vote does plus `units`, `creditsSpent`, `effectiveWeight` and `delegatedFrom` — the delegation graph, which OD-7 §5b names as more re-identifying than the ballots themselves — all in the voter's own public repo. Quadratic intensity is the last stage of the replacement design, not the first: see WatZappa/docs/OD-7-BALLOT-IDENTITY-REGISTRATION.md §5a.3/§5b.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "proposal",
          "voter",
          "signal",
          "units"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri",
            "description": "URI of the proposal this intensity declaration applies to"
          },
          "voter": {
            "type": "string",
            "format": "did",
            "description": "DID of the voter making this intensity declaration"
          },
          "signal": {
            "type": "integer",
            "minimum": -3,
            "maximum": 3,
            "description": "Signal direction, must match the base vote record"
          },
          "units": {
            "type": "integer",
            "minimum": 1,
            "maximum": 16,
            "description": "Quadratic voice credits allocated. 1=1², 4=2², 9=3², 16=4². Maps to intensity level 1-4."
          },
          "creditsSpent": {
            "type": "integer",
            "description": "Same as units, explicit alias for clarity in audit trails"
          },
          "delegatedFrom": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "did"
            },
            "description": "DIDs whose voting power was aggregated into this intensity record. Empty = direct."
          },
          "delegationDepth": {
            "type": "integer",
            "description": "0 = direct, 1 = one hop. Max 1 in PARA QV-LD."
          },
          "effectiveWeight": {
            "type": "string",
            "description": "Computed effective weight after QV sqrt and correlation discounting. Stored for audit trail."
          },
          "voteNullifier": {
            "type": "string",
            "maxLength": 128,
            "description": "One-person-one-vote nullifier for this proposal intensity declaration, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a."
          },
          "eligibilityProofRef": {
            "type": "string",
            "maxLength": 512,
            "description": "Opaque reference to the m8 eligibility/nullifier proof used to cast this intensity declaration."
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
