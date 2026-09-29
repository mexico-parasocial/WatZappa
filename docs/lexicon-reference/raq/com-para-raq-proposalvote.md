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
| `voteNullifier` | `string` | ❌  | DEPRECATED 2026-09-22 (OD-7 §5h): this collection is a public reaction and its count decides nothing, so no m8 nullifier is requested. The PDS refuses any write of this record that carries this field; do not set it. When reactions did request one, issuance made m8 derive the value server-side from a stable person identifier and store a durable (person, subject) row beside it. | Max Length: 128 |
| `eligibilityProofRef` | `string` | ❌  | DEPRECATED 2026-09-22 (OD-7 §5h): this reaction carries no m8 proof. The PDS refuses any write of this record that carries this field; do not set it. | Max Length: 512 |
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
            "description": "DEPRECATED 2026-09-22 (OD-7 §5h): this collection is a public reaction and its count decides nothing, so no m8 nullifier is requested. The PDS refuses any write of this record that carries this field; do not set it. When reactions did request one, issuance made m8 derive the value server-side from a stable person identifier and store a durable (person, subject) row beside it."
          },
          "eligibilityProofRef": {
            "type": "string",
            "maxLength": 512,
            "description": "DEPRECATED 2026-09-22 (OD-7 §5h): this reaction carries no m8 proof. The PDS refuses any write of this record that carries this field; do not set it."
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
