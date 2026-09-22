---
title: com.para.civic.getPolicyTally
description: Reference for the com.para.civic.getPolicyTally lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `query`

Get the weighted consensus tally for a policy post using civic vote signals from -3 to +3.

**Parameters:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `post` | `string` | ✅  |  | Format: `at-uri` |
**Output:**

- **Encoding:** `application/json`
- **Schema:**

**Schema Type:** `object`

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `tally` | [`com.para.civic.defs#policyTally`]([[com-para-civic-defs|com.para.civic.defs#policyTally]]) | ✅  |  |  |
**Possible Errors:**

- `NotFound`

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.getPolicyTally",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get the weighted consensus tally for a policy post using civic vote signals from -3 to +3.",
      "parameters": {
        "type": "params",
        "required": [
          "post"
        ],
        "properties": {
          "post": {
            "type": "string",
            "format": "at-uri"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": [
            "tally"
          ],
          "properties": {
            "tally": {
              "type": "ref",
              "ref": "com.para.civic.defs#policyTally"
            }
          }
        }
      },
      "errors": [
        {
          "name": "NotFound"
        }
      ]
    }
  }
}
```
