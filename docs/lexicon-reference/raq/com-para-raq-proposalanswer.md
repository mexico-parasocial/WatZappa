---
title: com.para.raq.proposalAnswer
description: Reference for the com.para.raq.proposalAnswer lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

A user's answer (-3 to 3) to a proposed RAQ question.

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  | URI of the com.para.raq.proposal being answered | Format: `at-uri` |
| `value` | `integer` | ✅  | Answer value: -3 strongly disagree to +3 strongly agree | Min: -3<br/>Max: 3 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.raq.proposalAnswer",
  "defs": {
    "main": {
      "type": "record",
      "description": "A user's answer (-3 to 3) to a proposed RAQ question.",
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
            "description": "URI of the com.para.raq.proposal being answered"
          },
          "value": {
            "type": "integer",
            "minimum": -3,
            "maximum": 3,
            "description": "Answer value: -3 strongly disagree to +3 strongly agree"
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
