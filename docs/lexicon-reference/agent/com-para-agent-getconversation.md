---
title: com.para.agent.getConversation
description: Reference for the com.para.agent.getConversation lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get the conversation history with an AI agent. Requires auth.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `agentId` | `string` | ✅  | Identifier of the agent whose conversation to retrieve. |  |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `messages` | Array of [`com.para.agent.defs#messageView`]([[com-para-agent-defs|com.para.agent.defs#messageView]]) | ✅  | Ordered list of messages in the conversation. |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.agent.getConversation",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get the conversation history with an AI agent. Requires auth.",
      "parameters": {
        "type": "params",
        "required": [
          "agentId"
        ],
        "properties": {
          "agentId": {
            "type": "string",
            "description": "Identifier of the agent whose conversation to retrieve."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "messages"
          ],
          "properties": {
            "messages": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "com.para.agent.defs#messageView"
              },
              "description": "Ordered list of messages in the conversation."
            }
          }
        }
      }
    }
  }
}
```
