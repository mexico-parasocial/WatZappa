---
title: com.para.agent.sendMessage
description: Reference for the com.para.agent.sendMessage lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `procedure`

Send a message to an AI agent and receive a response. Requires auth.

**Parameters:** _(None defined)_

**Input:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `agentId` | `string` | ✅  | Identifier of the agent to message. |  |
| `text` | `string` | ✅  | The message text to send. | Max Length: 10000<br/>Max Graphemes: 1000 |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `message` | [`com.para.agent.defs#messageView`]([[com-para-agent-defs|com.para.agent.defs#messageView]]) | ✅  | The agent's response message. |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.agent.sendMessage",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Send a message to an AI agent and receive a response. Requires auth.",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "agentId",
            "text"
          ],
          "properties": {
            "agentId": {
              "type": "string",
              "description": "Identifier of the agent to message."
            },
            "text": {
              "type": "string",
              "maxLength": 10000,
              "maxGraphemes": 1000,
              "description": "The message text to send."
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "message"
          ],
          "properties": {
            "message": {
              "type": "ref",
              "ref": "com.para.agent.defs#messageView",
              "description": "The agent's response message."
            }
          }
        }
      }
    }
  }
}
```
