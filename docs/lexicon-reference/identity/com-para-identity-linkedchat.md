---
title: com.para.identity.linkedChat
description: Reference for the com.para.identity.linkedChat lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="main"></a>
### `main`

**Type:** `record`

Declares that this account communicates on an external chat provider under a specific Matrix identity. Written to the PARA account's repo; the linked account's repo should carry the reciprocal record (com.para.identity.linkedChat with this DID as paraDid) for the link to verify. The bridge never relays sessions between providers — this record proves identity linkage only.

**Record Key:** `any`

**Record Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `provider` | `string` | ✅  | Identifier of the chat provider, e.g. 'para.social'. Also serves as the record key (one link record per provider). | Max Length: 256<br/>Max Graphemes: 128 |
| `matrixUserId` | `string` | ✅  | The full Matrix user id on that provider, e.g. '@user:matrix.para.social'. | Max Length: 512<br/>Max Graphemes: 256 |
| `paraDid` | `string` | ❌  | Present only in the reciprocal record written to the external-provider-linked account: the PARA DID this record vouches for. | Format: `did` |
| `linkedAt` | `string` | ✅  | When the link was established. | Format: `datetime` |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.identity.linkedChat",
  "defs": {
    "main": {
      "type": "record",
      "description": "Declares that this account communicates on an external chat provider under a specific Matrix identity. Written to the PARA account's repo; the linked account's repo should carry the reciprocal record (com.para.identity.linkedChat with this DID as paraDid) for the link to verify. The bridge never relays sessions between providers — this record proves identity linkage only.",
      "record": {
        "type": "object",
        "required": [
          "provider",
          "matrixUserId",
          "linkedAt"
        ],
        "properties": {
          "provider": {
            "type": "string",
            "description": "Identifier of the chat provider, e.g. 'para.social'. Also serves as the record key (one link record per provider).",
            "maxGraphemes": 128,
            "maxLength": 256
          },
          "matrixUserId": {
            "type": "string",
            "description": "The full Matrix user id on that provider, e.g. '@user:matrix.para.social'.",
            "maxGraphemes": 256,
            "maxLength": 512
          },
          "paraDid": {
            "type": "string",
            "format": "did",
            "description": "Present only in the reciprocal record written to the external-provider-linked account: the PARA DID this record vouches for."
          },
          "linkedAt": {
            "type": "string",
            "format": "datetime",
            "description": "When the link was established."
          }
        }
      },
      "key": "any"
    }
  }
}
```
