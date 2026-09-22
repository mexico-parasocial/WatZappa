---
title: com.para.civic.defs
description: Reference for the com.para.civic.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="cabildeooption"></a>
### `cabildeoOption`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `label` | `string` | ✅  |  | Max Length: 100 |
| `description` | `string` | ❌  |  | Max Length: 500 |
| `isConsensus` | `boolean` | ❌  |  |  |

---

<a name="optionsummary"></a>
### `optionSummary`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `optionIndex` | `integer` | ✅  |  | Min: 0 |
| `label` | `string` | ✅  |  | Max Length: 100 |
| `votes` | `integer` | ✅  |  | Min: 0 |
| `positions` | `integer` | ✅  |  | Min: 0 |

---

<a name="positioncounts"></a>
### `positionCounts`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `total` | `integer` | ✅  |  | Min: 0 |
| `for` | `integer` | ✅  |  | Min: 0 |
| `against` | `integer` | ✅  |  | Min: 0 |
| `amendment` | `integer` | ✅  |  | Min: 0 |
| `byOption` | Array of [`#optionSummary`](#optionsummary) | ✅  |  |  |

---

<a name="votetotals"></a>
### `voteTotals`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `total` | `integer` | ✅  |  | Min: 0 |
| `direct` | `integer` | ✅  |  | Min: 0 |
| `delegated` | `integer` | ✅  |  | Min: 0 |

---

<a name="partyvotesummary"></a>
### `partyVoteSummary`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `party` | `string` | ✅  |  | Max Length: 100 |
| `total` | `integer` | ✅  |  | Min: 0 |
| `byOption` | Array of `integer` | ✅  |  |  |

---

<a name="outcomesummary"></a>
### `outcomeSummary`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `winningOption` | `integer` | ❌  |  | Min: 0 |
| `totalParticipants` | `integer` | ✅  |  | Min: 0 |
| `effectiveTotalPower` | `integer` | ✅  |  | Min: 0 |
| `tie` | `boolean` | ✅  |  |  |
| `breakdown` | Array of [`#optionSummary`](#optionsummary) | ✅  |  |  |

---

<a name="viewercontext"></a>
### `viewerContext`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `currentVoteOption` | `integer` | ❌  |  | Min: 0 |
| `currentVoteIsDirect` | `boolean` | ❌  |  |  |
| `currentVoteCreatedAt` | `string` | ❌  |  | Format: `datetime` |
| `activeDelegation` | `string` | ❌  |  | Format: `did` |
| `delegateHasVoted` | `boolean` | ❌  |  |  |
| `delegatedVoteOption` | `integer` | ❌  |  | Min: 0 |
| `delegatedVotedAt` | `string` | ❌  |  | Format: `datetime` |
| `gracePeriodEndsAt` | `string` | ❌  |  | Format: `datetime` |
| `delegateVoteDismissed` | `boolean` | ❌  |  |  |

---

<a name="livesessionview"></a>
### `liveSessionView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `isLive` | `boolean` | ✅  |  |  |
| `hostDid` | `string` | ✅  |  | Format: `did` |
| `activeParticipantCount` | `integer` | ✅  |  | Min: 0 |
| `startedAt` | `string` | ✅  |  | Format: `datetime` |
| `participantPreviewDids` | Array of `string` | ✅  |  | Max Items: 5 |

---

<a name="cabildeolive"></a>
### `cabildeoLive`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `cabildeoUri` | `string` | ✅  |  | Format: `at-uri` |
| `community` | `string` | ✅  |  | Max Length: 100 |
| `phase` | `string` | ✅  |  | Known Values: `draft`, `open`, `deliberating`, `voting`, `resolved` |
| `expiresAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="cabildeoview"></a>
### `cabildeoView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `cid-link` | ✅  |  |  |
| `creator` | `string` | ✅  |  | Format: `did` |
| `indexedAt` | `string` | ✅  |  | Format: `datetime` |
| `title` | `string` | ✅  |  | Max Length: 300 |
| `description` | `string` | ✅  |  | Max Length: 30000 |
| `community` | `string` | ✅  |  | Max Length: 100 |
| `communities` | Array of `string` | ❌  |  | Max Items: 10 |
| `flairs` | Array of `string` | ❌  |  | Max Items: 10 |
| `region` | `string` | ❌  |  | Max Length: 100 |
| `geoRestricted` | `boolean` | ❌  |  |  |
| `geo` | [`#geoPoint`](#geopoint) | ❌  |  |  |
| `options` | Array of [`#cabildeoOption`](#cabildeooption) | ✅  |  | Max Items: 10 |
| `minQuorum` | `integer` | ❌  |  | Min: 1 |
| `voteVisibility` | `string` | ❌  |  | Known Values: `public`, `party_only`, `anonymous` |
| `phase` | `string` | ✅  |  | Known Values: `draft`, `open`, `deliberating`, `voting`, `resolved` |
| `phaseDeadline` | `string` | ❌  |  | Format: `datetime` |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |
| `optionSummary` | Array of [`#optionSummary`](#optionsummary) | ✅  |  |  |
| `positionCounts` | [`#positionCounts`](#positioncounts) | ✅  |  |  |
| `voteTotals` | [`#voteTotals`](#votetotals) | ✅  |  |  |
| `partyVoteSummary` | Array of [`#partyVoteSummary`](#partyvotesummary) | ❌  |  |  |
| `outcomeSummary` | [`#outcomeSummary`](#outcomesummary) | ❌  |  |  |
| `viewerContext` | [`#viewerContext`](#viewercontext) | ❌  |  |  |
| `liveSession` | [`#liveSessionView`](#livesessionview) | ❌  |  |  |

---

<a name="positionview"></a>
### `positionView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `uri` | `string` | ✅  |  | Format: `at-uri` |
| `cid` | `cid-link` | ✅  |  |  |
| `creator` | `string` | ✅  |  | Format: `did` |
| `indexedAt` | `string` | ✅  |  | Format: `datetime` |
| `cabildeo` | `string` | ✅  |  | Format: `at-uri` |
| `stance` | `string` | ✅  |  | Known Values: `for`, `against`, `amendment` |
| `optionIndex` | `integer` | ❌  |  | Min: 0 |
| `text` | `string` | ✅  |  | Max Length: 3000 |
| `compassQuadrant` | `string` | ❌  |  | Max Length: 100 |
| `createdAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="policysignalbucket"></a>
### `policySignalBucket`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `signal` | `integer` | ✅  |  | Min: -3<br/>Max: 3 |
| `count` | `integer` | ✅  |  | Min: 0 |

---

<a name="policytally"></a>
### `policyTally`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `subject` | `string` | ✅  |  | Format: `at-uri` |
| `subjectType` | `string` | ✅  |  | Known Values: `policy` |
| `community` | `string` | ✅  |  | Max Length: 100 |
| `voteCount` | `integer` | ✅  |  | Min: 0 |
| `directVoteCount` | `integer` | ✅  |  | Min: 0 |
| `delegatedVoteCount` | `integer` | ✅  |  | Min: 0 |
| `signalSum` | `integer` | ✅  |  |  |
| `signalAverage` | `string` | ✅  |  | Max Length: 32 |
| `eligibleVoterCount` | `integer` | ✅  |  | Min: 0 |
| `quorumTarget` | `integer` | ✅  |  | Min: 1 |
| `quorumMet` | `boolean` | ✅  |  |  |
| `official` | `boolean` | ✅  |  |  |
| `certified` | `boolean` | ✅  |  |  |
| `outcome` | `string` | ✅  |  | Known Values: `insufficient_quorum`, `contested`, `passed`, `strong_passed`, `failed` |
| `state` | `string` | ✅  |  | Known Values: `draft`, `deliberation`, `voting`, `passed`, `failed`, `official` |
| `breakdown` | Array of [`#policySignalBucket`](#policysignalbucket) | ✅  |  | Max Items: 7 |
| `computedAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="geopoint"></a>
### `geoPoint`

**Type:** `object`

Geographic coordinates in E7 (degrees × 10⁷) for map placement.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `latE7` | `integer` | ✅  |  | Min: -900000000<br/>Max: 900000000 |
| `lngE7` | `integer` | ✅  |  | Min: -1800000000<br/>Max: 1800000000 |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.civic.defs",
  "defs": {
    "cabildeoOption": {
      "type": "object",
      "required": [
        "label"
      ],
      "properties": {
        "label": {
          "type": "string",
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "maxLength": 500
        },
        "isConsensus": {
          "type": "boolean"
        }
      }
    },
    "optionSummary": {
      "type": "object",
      "required": [
        "optionIndex",
        "label",
        "votes",
        "positions"
      ],
      "properties": {
        "optionIndex": {
          "type": "integer",
          "minimum": 0
        },
        "label": {
          "type": "string",
          "maxLength": 100
        },
        "votes": {
          "type": "integer",
          "minimum": 0
        },
        "positions": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "positionCounts": {
      "type": "object",
      "required": [
        "total",
        "for",
        "against",
        "amendment",
        "byOption"
      ],
      "properties": {
        "total": {
          "type": "integer",
          "minimum": 0
        },
        "for": {
          "type": "integer",
          "minimum": 0
        },
        "against": {
          "type": "integer",
          "minimum": 0
        },
        "amendment": {
          "type": "integer",
          "minimum": 0
        },
        "byOption": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#optionSummary"
          }
        }
      }
    },
    "voteTotals": {
      "type": "object",
      "required": [
        "total",
        "direct",
        "delegated"
      ],
      "properties": {
        "total": {
          "type": "integer",
          "minimum": 0
        },
        "direct": {
          "type": "integer",
          "minimum": 0
        },
        "delegated": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "partyVoteSummary": {
      "type": "object",
      "required": [
        "party",
        "total",
        "byOption"
      ],
      "properties": {
        "party": {
          "type": "string",
          "maxLength": 100
        },
        "total": {
          "type": "integer",
          "minimum": 0
        },
        "byOption": {
          "type": "array",
          "items": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    },
    "outcomeSummary": {
      "type": "object",
      "required": [
        "totalParticipants",
        "effectiveTotalPower",
        "tie",
        "breakdown"
      ],
      "properties": {
        "winningOption": {
          "type": "integer",
          "minimum": 0
        },
        "totalParticipants": {
          "type": "integer",
          "minimum": 0
        },
        "effectiveTotalPower": {
          "type": "integer",
          "minimum": 0
        },
        "tie": {
          "type": "boolean"
        },
        "breakdown": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#optionSummary"
          }
        }
      }
    },
    "viewerContext": {
      "type": "object",
      "properties": {
        "currentVoteOption": {
          "type": "integer",
          "minimum": 0
        },
        "currentVoteIsDirect": {
          "type": "boolean"
        },
        "currentVoteCreatedAt": {
          "type": "string",
          "format": "datetime"
        },
        "activeDelegation": {
          "type": "string",
          "format": "did"
        },
        "delegateHasVoted": {
          "type": "boolean"
        },
        "delegatedVoteOption": {
          "type": "integer",
          "minimum": 0
        },
        "delegatedVotedAt": {
          "type": "string",
          "format": "datetime"
        },
        "gracePeriodEndsAt": {
          "type": "string",
          "format": "datetime"
        },
        "delegateVoteDismissed": {
          "type": "boolean"
        }
      }
    },
    "liveSessionView": {
      "type": "object",
      "required": [
        "isLive",
        "hostDid",
        "activeParticipantCount",
        "startedAt",
        "participantPreviewDids"
      ],
      "properties": {
        "isLive": {
          "type": "boolean"
        },
        "hostDid": {
          "type": "string",
          "format": "did"
        },
        "activeParticipantCount": {
          "type": "integer",
          "minimum": 0
        },
        "startedAt": {
          "type": "string",
          "format": "datetime"
        },
        "participantPreviewDids": {
          "type": "array",
          "maxLength": 5,
          "items": {
            "type": "string",
            "format": "did"
          }
        }
      }
    },
    "cabildeoLive": {
      "type": "object",
      "required": [
        "cabildeoUri",
        "community",
        "phase",
        "expiresAt"
      ],
      "properties": {
        "cabildeoUri": {
          "type": "string",
          "format": "at-uri"
        },
        "community": {
          "type": "string",
          "maxLength": 100
        },
        "phase": {
          "type": "string",
          "knownValues": [
            "draft",
            "open",
            "deliberating",
            "voting",
            "resolved"
          ]
        },
        "expiresAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "cabildeoView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "creator",
        "indexedAt",
        "title",
        "description",
        "community",
        "options",
        "phase",
        "createdAt",
        "optionSummary",
        "positionCounts",
        "voteTotals"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "cid-link"
        },
        "creator": {
          "type": "string",
          "format": "did"
        },
        "indexedAt": {
          "type": "string",
          "format": "datetime"
        },
        "title": {
          "type": "string",
          "maxLength": 300
        },
        "description": {
          "type": "string",
          "maxLength": 30000
        },
        "community": {
          "type": "string",
          "maxLength": 100
        },
        "communities": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 100
          },
          "maxLength": 10
        },
        "flairs": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 100
          },
          "maxLength": 10
        },
        "region": {
          "type": "string",
          "maxLength": 100
        },
        "geoRestricted": {
          "type": "boolean"
        },
        "geo": {
          "type": "ref",
          "ref": "#geoPoint"
        },
        "options": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#cabildeoOption"
          },
          "maxLength": 10
        },
        "minQuorum": {
          "type": "integer",
          "minimum": 1
        },
        "voteVisibility": {
          "type": "string",
          "knownValues": [
            "public",
            "party_only",
            "anonymous"
          ]
        },
        "phase": {
          "type": "string",
          "knownValues": [
            "draft",
            "open",
            "deliberating",
            "voting",
            "resolved"
          ]
        },
        "phaseDeadline": {
          "type": "string",
          "format": "datetime"
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "optionSummary": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#optionSummary"
          }
        },
        "positionCounts": {
          "type": "ref",
          "ref": "#positionCounts"
        },
        "voteTotals": {
          "type": "ref",
          "ref": "#voteTotals"
        },
        "partyVoteSummary": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "#partyVoteSummary"
          }
        },
        "outcomeSummary": {
          "type": "ref",
          "ref": "#outcomeSummary"
        },
        "viewerContext": {
          "type": "ref",
          "ref": "#viewerContext"
        },
        "liveSession": {
          "type": "ref",
          "ref": "#liveSessionView"
        }
      }
    },
    "positionView": {
      "type": "object",
      "required": [
        "uri",
        "cid",
        "creator",
        "indexedAt",
        "cabildeo",
        "stance",
        "text",
        "createdAt"
      ],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "cid-link"
        },
        "creator": {
          "type": "string",
          "format": "did"
        },
        "indexedAt": {
          "type": "string",
          "format": "datetime"
        },
        "cabildeo": {
          "type": "string",
          "format": "at-uri"
        },
        "stance": {
          "type": "string",
          "knownValues": [
            "for",
            "against",
            "amendment"
          ]
        },
        "optionIndex": {
          "type": "integer",
          "minimum": 0
        },
        "text": {
          "type": "string",
          "maxLength": 3000
        },
        "compassQuadrant": {
          "type": "string",
          "maxLength": 100
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "policySignalBucket": {
      "type": "object",
      "required": [
        "signal",
        "count"
      ],
      "properties": {
        "signal": {
          "type": "integer",
          "minimum": -3,
          "maximum": 3
        },
        "count": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "policyTally": {
      "type": "object",
      "required": [
        "subject",
        "subjectType",
        "community",
        "voteCount",
        "directVoteCount",
        "delegatedVoteCount",
        "signalSum",
        "signalAverage",
        "eligibleVoterCount",
        "quorumTarget",
        "quorumMet",
        "official",
        "certified",
        "outcome",
        "state",
        "breakdown",
        "computedAt"
      ],
      "properties": {
        "subject": {
          "type": "string",
          "format": "at-uri"
        },
        "subjectType": {
          "type": "string",
          "knownValues": [
            "policy"
          ]
        },
        "community": {
          "type": "string",
          "maxLength": 100
        },
        "voteCount": {
          "type": "integer",
          "minimum": 0
        },
        "directVoteCount": {
          "type": "integer",
          "minimum": 0
        },
        "delegatedVoteCount": {
          "type": "integer",
          "minimum": 0
        },
        "signalSum": {
          "type": "integer"
        },
        "signalAverage": {
          "type": "string",
          "maxLength": 32
        },
        "eligibleVoterCount": {
          "type": "integer",
          "minimum": 0
        },
        "quorumTarget": {
          "type": "integer",
          "minimum": 1
        },
        "quorumMet": {
          "type": "boolean"
        },
        "official": {
          "type": "boolean"
        },
        "certified": {
          "type": "boolean"
        },
        "outcome": {
          "type": "string",
          "knownValues": [
            "insufficient_quorum",
            "contested",
            "passed",
            "strong_passed",
            "failed"
          ]
        },
        "state": {
          "type": "string",
          "knownValues": [
            "draft",
            "deliberation",
            "voting",
            "passed",
            "failed",
            "official"
          ]
        },
        "breakdown": {
          "type": "array",
          "maxLength": 7,
          "items": {
            "type": "ref",
            "ref": "#policySignalBucket"
          }
        },
        "computedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "geoPoint": {
      "type": "object",
      "description": "Geographic coordinates in E7 (degrees × 10⁷) for map placement.",
      "required": [
        "latE7",
        "lngE7"
      ],
      "properties": {
        "latE7": {
          "type": "integer",
          "minimum": -900000000,
          "maximum": 900000000
        },
        "lngE7": {
          "type": "integer",
          "minimum": -1800000000,
          "maximum": 1800000000
        }
      }
    }
  }
}
```
