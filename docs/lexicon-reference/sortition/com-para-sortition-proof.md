---
title: com.para.sortition.proof
description: Reference for the com.para.sortition.proof lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

**Record Key:** `tid`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ✅  |  | Format: `did` |
| `community` | `string` | ✅  |  | Format: `at-uri` |
| `chamber` | `string` | ✅  |  | Enum: `A`, `B` |
| `drandRound` | `integer` | ✅  | drand beacon round number used for sortition |  |
| `drandRandomness` | `string` | ✅  | Hex-encoded drand randomness beacon |  |
| `hashInput` | `string` | ✅  | Hex-encoded input to SHA-256: beacon || did || communityUri |  |
| `hashOutput` | `string` | ✅  | Hex-encoded SHA-256 output |  |
| `threshold` | `string` | ✅  | Load-balancing threshold used (0.0-1.0) |  |
| `timestamp` | `string` | ✅  |  | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.sortition.proof",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": [
          "did",
          "community",
          "chamber",
          "drandRound",
          "drandRandomness",
          "hashInput",
          "hashOutput",
          "threshold",
          "timestamp"
        ],
        "properties": {
          "did": {
            "type": "string",
            "format": "did"
          },
          "community": {
            "type": "string",
            "format": "at-uri"
          },
          "chamber": {
            "type": "string",
            "enum": [
              "A",
              "B"
            ]
          },
          "drandRound": {
            "type": "integer",
            "description": "drand beacon round number used for sortition"
          },
          "drandRandomness": {
            "type": "string",
            "description": "Hex-encoded drand randomness beacon"
          },
          "hashInput": {
            "type": "string",
            "description": "Hex-encoded input to SHA-256: beacon || did || communityUri"
          },
          "hashOutput": {
            "type": "string",
            "description": "Hex-encoded SHA-256 output"
          },
          "threshold": {
            "type": "string",
            "description": "Load-balancing threshold used (0.0-1.0)"
          },
          "timestamp": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```
