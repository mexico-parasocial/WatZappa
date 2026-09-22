---
title: com.para.community.defs
description: Reference for the com.para.community.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="summary"></a>
### `summary`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `members` | `integer` | ✅  |  |  |
| `visiblePosters` | `integer` | ✅  |  |  |
| `policyPosts` | `integer` | ✅  |  |  |
| `matterPosts` | `integer` | ✅  |  |  |
| `badgeHolders` | `integer` | ✅  |  |  |

---

<a name="person"></a>
### `person`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ❌  |  | Format: `did` |
| `handle` | `string` | ❌  |  | Format: `handle` |
| `displayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `avatar` | `string` | ❌  |  | Format: `uri` |

---

<a name="moderatorview"></a>
### `moderatorView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ❌  |  | Format: `did` |
| `handle` | `string` | ❌  |  | Format: `handle` |
| `displayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `avatar` | `string` | ❌  |  | Format: `uri` |
| `role` | `string` | ✅  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `badge` | `string` | ✅  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `capabilities` | Array of `string` | ✅  |  |  |
| `validFrom` | `string` | ❌  |  | Format: `datetime` |
| `validUntil` | `string` | ❌  |  | Format: `datetime` |
| `ratifiedBy` | `string` | ❌  |  | Format: `at-uri` |

---

<a name="officialview"></a>
### `officialView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ❌  |  | Format: `did` |
| `handle` | `string` | ❌  |  | Format: `handle` |
| `displayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `avatar` | `string` | ❌  |  | Format: `uri` |
| `office` | `string` | ✅  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `mandate` | `string` | ✅  |  | Max Length: 1000<br/>Max Graphemes: 200 |
| `validFrom` | `string` | ❌  |  | Format: `datetime` |
| `validUntil` | `string` | ❌  |  | Format: `datetime` |
| `ratifiedBy` | `string` | ❌  |  | Format: `at-uri` |

---

<a name="applicant"></a>
### `applicant`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `did` | `string` | ❌  |  | Format: `did` |
| `handle` | `string` | ❌  |  | Format: `handle` |
| `displayName` | `string` | ❌  |  | Max Length: 640<br/>Max Graphemes: 64 |
| `avatar` | `string` | ❌  |  | Format: `uri` |
| `appliedAt` | `string` | ✅  |  | Format: `datetime` |
| `status` | `string` | ✅  |  | Known Values: `applied`, `approved`, `rejected` |
| `note` | `string` | ❌  |  | Max Length: 1000<br/>Max Graphemes: 200 |

---

<a name="deputyroleview"></a>
### `deputyRoleView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `key` | `string` | ✅  |  | Max Length: 128<br/>Max Graphemes: 128 |
| `tier` | `string` | ✅  |  | Max Length: 32<br/>Max Graphemes: 32 |
| `role` | `string` | ✅  |  | Max Length: 64<br/>Max Graphemes: 64 |
| `description` | `string` | ✅  |  | Max Length: 2000<br/>Max Graphemes: 300 |
| `capabilities` | Array of `string` | ✅  |  |  |
| `activeHolder` | [`#person`](#person) | ❌  |  |  |
| `activeSince` | `string` | ❌  |  | Format: `datetime` |
| `validFrom` | `string` | ❌  |  | Format: `datetime` |
| `validUntil` | `string` | ❌  |  | Format: `datetime` |
| `ratifiedBy` | `string` | ❌  |  | Format: `at-uri` |
| `votes` | `integer` | ✅  |  |  |
| `applicants` | Array of [`#applicant`](#applicant) | ✅  |  |  |

---

<a name="metadata"></a>
### `metadata`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `termLengthDays` | `integer` | ❌  |  |  |
| `reviewCadence` | `string` | ❌  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `escalationPath` | `string` | ❌  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `publicContact` | `string` | ❌  |  | Max Length: 256<br/>Max Graphemes: 128 |
| `lastPublishedAt` | `string` | ❌  |  | Format: `datetime` |
| `state` | `string` | ❌  |  | Max Length: 128<br/>Max Graphemes: 64 |
| `matterFlairIds` | Array of `string` | ❌  |  |  |
| `policyFlairIds` | Array of `string` | ❌  |  |  |

---

<a name="historyentry"></a>
### `historyEntry`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  | Max Length: 128<br/>Max Graphemes: 128 |
| `action` | `string` | ✅  |  | Max Length: 128<br/>Max Graphemes: 128 |
| `actorDid` | `string` | ❌  |  | Format: `did` |
| `actorHandle` | `string` | ❌  |  | Format: `handle` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `summary` | `string` | ✅  |  | Max Length: 2000<br/>Max Graphemes: 300 |
| `ratifiedBy` | `string` | ❌  | Reference to an approved assembly decision that authorized this change. | Format: `at-uri` |

---

<a name="sharedcontentview"></a>
### `sharedContentView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `subject` | [`com.atproto.repo.strongRef`](https://github.com/bluesky-social/atproto/tree/main/lexicons/com/atproto/repo/strongref.json#undefined) | ✅  |  |  |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `sourceCommunityUri` | `string` | ❌  |  | Format: `at-uri` |
| `contentType` | `string` | ✅  |  | Known Values: `post`, `cabildeo`, `collection`, `mapInitiative`, `external` |
| `sharedBy` | `string` | ✅  |  | Format: `did` |
| `sharedByHandle` | `string` | ❌  |  | Format: `handle` |
| `note` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `visibility` | `string` | ❌  |  | Known Values: `community`, `public`, `stewards` |
| `sourceApp` | `string` | ❌  |  | Max Length: 512<br/>Max Graphemes: 128 |
| `embedContext` | `unknown` | ❌  |  |  |
| `pinned` | `boolean` | ❌  |  |  |
| `sortRank` | `integer` | ❌  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `removed` | `boolean` | ✅  |  |  |
| `removedAt` | `string` | ❌  |  | Format: `datetime` |
| `removedBy` | `string` | ❌  |  | Format: `did` |
| `latestAction` | [`#sharedContentActionView`](#sharedcontentactionview) | ❌  |  |  |
| `hydrationState` | `string` | ❌  |  | Known Values: `ready`, `unresolved`, `deleted` |

---

<a name="sharedcontentactionview"></a>
### `sharedContentActionView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `sharedContent` | [`com.atproto.repo.strongRef`](https://github.com/bluesky-social/atproto/tree/main/lexicons/com/atproto/repo/strongref.json#undefined) | ✅  |  |  |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `action` | `string` | ✅  |  | Known Values: `remove`, `restore`, `pin`, `unpin` |
| `note` | `string` | ❌  |  | Max Length: 3000<br/>Max Graphemes: 300 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `createdBy` | `string` | ✅  |  | Format: `did` |

---

<a name="communityrelationview"></a>
### `communityRelationView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `parentCommunityUri` | `string` | ✅  |  | Format: `at-uri` |
| `childCommunityUri` | `string` | ✅  |  | Format: `at-uri` |
| `relation` | `string` | ✅  |  | Known Values: `parentChild` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `createdBy` | `string` | ✅  |  | Format: `did` |

---

<a name="briefingpackview"></a>
### `briefingPackView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `string` | ✅  |  | Format: `cid` |
| `packType` | `string` | ✅  |  | Enum: `party_lobbying` |
| `communityUri` | `string` | ✅  |  | Format: `at-uri` |
| `party` | `string` | ✅  |  | Max Length: 120 |
| `title` | `string` | ✅  |  | Max Length: 300 |
| `summary` | `string` | ❌  |  | Max Length: 5000 |
| `cabildeoUris` | Array of `string` | ❌  |  | Max Items: 100 |
| `civicTreeCardIds` | Array of `string` | ❌  |  | Max Items: 200 |
| `evidenceUris` | Array of `string` | ❌  |  | Max Items: 300 |
| `sembleCollectionUri` | `string` | ❌  |  | Format: `at-uri` |
| `marginCollectionUri` | `string` | ❌  |  | Format: `at-uri` |
| `obsidianExportUri` | `string` | ❌  |  | Max Length: 2000 |
| `status` | `string` | ✅  |  | Enum: `draft`, `published`, `archived` |
| `createdBy` | `string` | ✅  |  | Format: `did` |
| `creator` | [`app.bsky.actor.defs#profileView`](https://github.com/bluesky-social/atproto/tree/main/lexicons/app/bsky/actor/defs.json#profileView) | ❌  |  |  |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `updatedAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="obsidianfileview"></a>
### `obsidianFileView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `path` | `string` | ✅  |  |  |
| `content` | `string` | ✅  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.defs",
  "defs": {
    "summary": {
      "type": "object",
      "required": [
        "members",
        "visiblePosters",
        "policyPosts",
        "matterPosts",
        "badgeHolders"
      ],
      "properties": {
        "members": {
          "type": "integer"
        },
        "visiblePosters": {
          "type": "integer"
        },
        "policyPosts": {
          "type": "integer"
        },
        "matterPosts": {
          "type": "integer"
        },
        "badgeHolders": {
          "type": "integer"
        }
      }
    },
    "person": {
      "type": "object",
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "handle": {
          "type": "string",
          "format": "handle"
        },
        "displayName": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 640
        },
        "avatar": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "moderatorView": {
      "type": "object",
      "required": [
        "role",
        "badge",
        "capabilities"
      ],
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "handle": {
          "type": "string",
          "format": "handle"
        },
        "displayName": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 640
        },
        "avatar": {
          "type": "string",
          "format": "uri"
        },
        "role": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 64
        },
        "badge": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 64
        },
        "capabilities": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        },
        "validFrom": {
          "type": "string",
          "format": "datetime"
        },
        "validUntil": {
          "type": "string",
          "format": "datetime"
        },
        "ratifiedBy": {
          "type": "string",
          "format": "at-uri"
        }
      }
    },
    "officialView": {
      "type": "object",
      "required": [
        "office",
        "mandate"
      ],
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "handle": {
          "type": "string",
          "format": "handle"
        },
        "displayName": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 640
        },
        "avatar": {
          "type": "string",
          "format": "uri"
        },
        "office": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 64
        },
        "mandate": {
          "type": "string",
          "maxGraphemes": 200,
          "maxLength": 1000
        },
        "validFrom": {
          "type": "string",
          "format": "datetime"
        },
        "validUntil": {
          "type": "string",
          "format": "datetime"
        },
        "ratifiedBy": {
          "type": "string",
          "format": "at-uri"
        }
      }
    },
    "applicant": {
      "type": "object",
      "required": [
        "appliedAt",
        "status"
      ],
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "handle": {
          "type": "string",
          "format": "handle"
        },
        "displayName": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 640
        },
        "avatar": {
          "type": "string",
          "format": "uri"
        },
        "appliedAt": {
          "type": "string",
          "format": "datetime"
        },
        "status": {
          "type": "string",
          "knownValues": [
            "applied",
            "approved",
            "rejected"
          ]
        },
        "note": {
          "type": "string",
          "maxGraphemes": 200,
          "maxLength": 1000
        }
      }
    },
    "deputyRoleView": {
      "type": "object",
      "required": [
        "key",
        "tier",
        "role",
        "description",
        "capabilities",
        "votes",
        "applicants"
      ],
      "properties": {
        "key": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 128
        },
        "tier": {
          "type": "string",
          "maxGraphemes": 32,
          "maxLength": 32
        },
        "role": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 64
        },
        "description": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 2000
        },
        "capabilities": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 64,
            "maxLength": 128
          }
        },
        "activeHolder": {
          "type": "ref",
          "ref": "#person"
        },
        "activeSince": {
          "type": "string",
          "format": "datetime"
        },
        "validFrom": {
          "type": "string",
          "format": "datetime"
        },
        "validUntil": {
          "type": "string",
          "format": "datetime"
        },
        "ratifiedBy": {
          "type": "string",
          "format": "at-uri"
        },
        "votes": {
          "type": "integer"
        },
        "applicants": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#applicant"
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "termLengthDays": {
          "type": "integer"
        },
        "reviewCadence": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 256
        },
        "escalationPath": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 256
        },
        "publicContact": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 256
        },
        "lastPublishedAt": {
          "type": "string",
          "format": "datetime"
        },
        "state": {
          "type": "string",
          "maxGraphemes": 64,
          "maxLength": 128
        },
        "matterFlairIds": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 128
          }
        },
        "policyFlairIds": {
          "type": "array",
          "items": {
            "type": "string",
            "maxGraphemes": 128,
            "maxLength": 128
          }
        }
      }
    },
    "historyEntry": {
      "type": "object",
      "required": [
        "id",
        "action",
        "createdAt",
        "summary"
      ],
      "properties": {
        "id": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 128
        },
        "action": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 128
        },
        "actorDid": {
          "type": "string",
          "format": "did"
        },
        "actorHandle": {
          "type": "string",
          "format": "handle"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "summary": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 2000
        },
        "ratifiedBy": {
          "type": "string",
          "format": "at-uri",
          "description": "Reference to an approved assembly decision that authorized this change."
        }
      }
    },
    "sharedContentView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "subject",
        "communityUri",
        "contentType",
        "sharedBy",
        "createdAt",
        "removed"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "subject": {
          "type": "ref",
          "ref": "com.atproto.repo.strongRef"
        },
        "communityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "sourceCommunityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "contentType": {
          "type": "string",
          "knownValues": [
            "post",
            "cabildeo",
            "collection",
            "mapInitiative",
            "external"
          ]
        },
        "sharedBy": {
          "type": "string",
          "format": "did"
        },
        "sharedByHandle": {
          "type": "string",
          "format": "handle"
        },
        "note": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 3000
        },
        "visibility": {
          "type": "string",
          "knownValues": [
            "community",
            "public",
            "stewards"
          ]
        },
        "sourceApp": {
          "type": "string",
          "maxGraphemes": 128,
          "maxLength": 512
        },
        "embedContext": {
          "type": "unknown"
        },
        "pinned": {
          "type": "boolean"
        },
        "sortRank": {
          "type": "integer"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "removed": {
          "type": "boolean"
        },
        "removedAt": {
          "type": "string",
          "format": "datetime"
        },
        "removedBy": {
          "type": "string",
          "format": "did"
        },
        "latestAction": {
          "type": "ref",
          "ref": "#sharedContentActionView"
        },
        "hydrationState": {
          "type": "string",
          "knownValues": [
            "ready",
            "unresolved",
            "deleted"
          ]
        }
      }
    },
    "sharedContentActionView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "sharedContent",
        "communityUri",
        "action",
        "createdAt",
        "createdBy"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "sharedContent": {
          "type": "ref",
          "ref": "com.atproto.repo.strongRef"
        },
        "communityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "action": {
          "type": "string",
          "knownValues": [
            "remove",
            "restore",
            "pin",
            "unpin"
          ]
        },
        "note": {
          "type": "string",
          "maxGraphemes": 300,
          "maxLength": 3000
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "createdBy": {
          "type": "string",
          "format": "did"
        }
      }
    },
    "communityRelationView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "parentCommunityUri",
        "childCommunityUri",
        "relation",
        "createdAt",
        "createdBy"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "parentCommunityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "childCommunityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "relation": {
          "type": "string",
          "knownValues": [
            "parentChild"
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "createdBy": {
          "type": "string",
          "format": "did"
        }
      }
    },
    "briefingPackView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "packType",
        "communityUri",
        "party",
        "title",
        "status",
        "createdBy",
        "createdAt",
        "updatedAt"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "packType": {
          "type": "string",
          "enum": [
            "party_lobbying"
          ]
        },
        "communityUri": {
          "type": "string",
          "format": "at-uri"
        },
        "party": {
          "type": "string",
          "maxLength": 120
        },
        "title": {
          "type": "string",
          "maxLength": 300
        },
        "summary": {
          "type": "string",
          "maxLength": 5000
        },
        "cabildeoUris": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "at-uri"
          },
          "maxLength": 100
        },
        "civicTreeCardIds": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 200
          },
          "maxLength": 200
        },
        "evidenceUris": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 2000
          },
          "maxLength": 300
        },
        "sembleCollectionUri": {
          "type": "string",
          "format": "at-uri"
        },
        "marginCollectionUri": {
          "type": "string",
          "format": "at-uri"
        },
        "obsidianExportUri": {
          "type": "string",
          "maxLength": 2000
        },
        "status": {
          "type": "string",
          "enum": [
            "draft",
            "published",
            "archived"
          ]
        },
        "createdBy": {
          "type": "string",
          "format": "did"
        },
        "creator": {
          "type": "ref",
          "ref": "app.bsky.actor.defs#profileView"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "updatedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "obsidianFileView": {
      "type": "object",
      "required": [
        "path",
        "content"
      ],
      "properties": {
        "path": {
          "type": "string"
        },
        "content": {
          "type": "string"
        }
      }
    }
  }
}
```
