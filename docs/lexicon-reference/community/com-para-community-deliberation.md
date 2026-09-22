---
title: com.para.community.deliberation
description: Reference for the com.para.community.deliberation lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

An argument made about a proposal, under the author's own name. Deliberation is deliberately attributable — debate is meant to be owned by whoever makes it — which is why it is not covered by the ballot freeze of OD-7 §5c.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `proposal` | `string` | ✅  | The proposal this argument is about. | Format: `at-uri` |
| `community` | `string` | ❌  |  | Format: `at-uri` |
| `author` | `string` | ✅  | DID of whoever makes the argument. The record lives in their own repo, so it is attributable to them regardless. | Format: `did` |
| `body` | `string` | ✅  | The argument itself. | Max Length: 3000<br/>Max Graphemes: 300 |
| `stance` | `string` | ❌  | What the argument does to the proposal. | Known Values: `for`, `against`, `amendment`, `question` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.deliberation",
  "defs": {
    "main": {
      "type": "record",
      "description": "An argument made about a proposal, under the author's own name. Deliberation is deliberately attributable — debate is meant to be owned by whoever makes it — which is why it is not covered by the ballot freeze of OD-7 §5c.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "proposal",
          "author",
          "body",
          "createdAt"
        ],
        "properties": {
          "proposal": {
            "type": "string",
            "format": "at-uri",
            "description": "The proposal this argument is about."
          },
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "author": {
            "type": "string",
            "format": "did",
            "description": "DID of whoever makes the argument. The record lives in their own repo, so it is attributable to them regardless."
          },
          "body": {
            "type": "string",
            "maxLength": 3000,
            "maxGraphemes": 300,
            "description": "The argument itself."
          },
          "stance": {
            "type": "string",
            "knownValues": [
              "for",
              "against",
              "amendment",
              "question"
            ],
            "description": "What the argument does to the proposal."
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
