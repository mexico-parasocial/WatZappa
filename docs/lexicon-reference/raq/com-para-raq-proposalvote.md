---
title: com.para.raq.proposalVote
description: Reference for the com.para.raq.proposalVote lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A like/dislike vote on a proposed RAQ question.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  | URI of the com.para.raq.proposal being voted on | Format: `at-uri` |
| `value` | `integer` | ✅  | Vote direction: -1 downvote, 1 upvote | Min: -1<br/>Max: 1 |
| `voteNullifier` | `string` | ❌  | One-person-one-vote nullifier for this RAQ proposal, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. | Max Length: 128 |
| `eligibilityProofRef` | `string` | ❌  | Opaque reference to the m8 eligibility/nullifier proof used to cast this vote. | Max Length: 512 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.proposalVote",
  "defs": {
    "main": {
      "type": "record",
      "description": "A like/dislike vote on a proposed RAQ question.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "subject",
          "value",
          "createdAt"
        ],
        "properties": {
          "subject": {
            "type": "string",
            "format": "at-uri",
            "description": "URI of the com.para.raq.proposal being voted on"
          },
          "value": {
            "type": "integer",
            "minimum": -1,
            "maximum": 1,
            "description": "Vote direction: -1 downvote, 1 upvote"
          },
          "voteNullifier": {
            "type": "string",
            "maxLength": 128,
            "description": "One-person-one-vote nullifier for this RAQ proposal, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a."
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
