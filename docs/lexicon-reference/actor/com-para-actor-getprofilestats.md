---
title: com.para.actor.getProfileStats
description: Reference for the com.para.actor.getProfileStats lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get Para profile stats and current Para status for an actor.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `actor` | `string` | ✅  | Handle or DID of the actor. | Format: `at-identifier` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `actor` | `string` | ✅  |  | Format: `did` |
| `stats` | [`com.para.actor.defs#profileStats`]([[com-para-actor-defs|com.para.actor.defs#profileStats]]) | ✅  |  |  |
| `status` | [`com.para.actor.defs#statusView`]([[com-para-actor-defs|com.para.actor.defs#statusView]]) | ❌  |  |  |
**Possible Errors:**

- `NotFound`
- `BlockedActor`
- `BlockedByActor`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.actor.getProfileStats",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get Para profile stats and current Para status for an actor.",
      "parameters": {
        "type": "params",
        "required": [
          "actor"
        ],
        "properties": {
          "actor": {
            "type": "string",
            "format": "at-identifier",
            "description": "Handle or DID of the actor."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "actor",
            "stats"
          ],
          "properties": {
            "actor": {
              "type": "string",
              "format": "did"
            },
            "stats": {
              "type": "ref",
              "ref": "com.para.actor.defs#profileStats"
            },
            "status": {
              "type": "ref",
              "ref": "com.para.actor.defs#statusView"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        },
        {
          "name": "BlockedActor"
        },
        {
          "name": "BlockedByActor"
        }
      ]
    }
  }
}
```
