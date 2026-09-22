---
title: com.para.agent.defs
description: Reference for the com.para.agent.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="messageview"></a>
### `messageView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `text` | `string` | ✅  |  | Max Length: 10000<br/>Max Graphemes: 1000 |
| `sender` | `string` | ✅  |  | Known Values: `user`, `agent` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.agent.defs",
  "defs": {
    "messageView": {
      "type": "object",
      "required": [
        "id",
        "text",
        "sender",
        "createdAt"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "text": {
          "type": "string",
          "maxLength": 10000,
          "maxGraphemes": 1000
        },
        "sender": {
          "type": "string",
          "knownValues": [
            "user",
            "agent"
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```
