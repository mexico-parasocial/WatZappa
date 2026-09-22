---
title: com.para.civic.openQuestionVote
description: Reference for the com.para.civic.openQuestionVote lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A vote on an open question reply. Stores the voter's upvote/downvote on a specific reply.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  | The reply post URI being voted on. | Format: `at-uri` |
| `value` | `integer` | ✅  | Vote value: -1 = downvote, 0 = none (removal), 1 = upvote. | Min: -1<br/>Max: 1 |
| `voteNullifier` | `string` | ❌  | One-person-one-vote nullifier for this open question reply, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. | Max Length: 128 |
| `eligibilityProofRef` | `string` | ❌  | Opaque reference to the m8 eligibility/nullifier proof used to cast this vote. | Max Length: 512 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.openQuestionVote",
  "defs": {
    "main": {
      "type": "record",
      "description": "A vote on an open question reply. Stores the voter's upvote/downvote on a specific reply.",
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
            "description": "The reply post URI being voted on."
          },
          "value": {
            "type": "integer",
            "minimum": -1,
            "maximum": 1,
            "description": "Vote value: -1 = downvote, 0 = none (removal), 1 = upvote."
          },
          "voteNullifier": {
            "type": "string",
            "maxLength": 128,
            "description": "One-person-one-vote nullifier for this open question reply, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a."
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
