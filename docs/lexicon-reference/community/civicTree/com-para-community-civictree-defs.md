---
title: com.para.community.civicTree.defs
description: Reference for the com.para.community.civicTree.defs lexicon
---
**Lexicon Version:** 1

## Definitions

<a name="cardview"></a>
### `cardView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `uri` | `string` | ❌  |  | Format: `at-uri` |
| `cid` | `string` | ❌  |  | Format: `cid` |
| `community_uri` | `string` | ✅  |  | Format: `at-uri` |
| `author_did` | `string` | ✅  |  | Format: `did` |
| `title` | `string` | ✅  |  | Max Length: 500 |
| `content` | `string` | ❌  |  | Max Length: 10000 |
| `card_type` | `string` | ✅  |  | Max Length: 64 |
| `source_uri` | `string` | ❌  |  | Format: `at-uri` |
| `source_url` | `string` | ❌  |  | Format: `uri` |
| `metadata` | `string` | ❌  |  | Max Length: 20000 |
| `influence` | `integer` | ❌  |  |  |
| `vote_count` | `integer` | ❌  |  | Min: 0 |
| `stance` | `string` | ❌  |  | Known Values: `pro`, `con`, `neutral` |
| `compass_quadrant` | `string` | ❌  |  | Max Length: 64 |
| `created_at` | `string` | ❌  |  | Format: `datetime` |
| `updated_at` | `string` | ❌  |  | Format: `datetime` |

---

<a name="relationshipview"></a>
### `relationshipView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `uri` | `string` | ❌  |  | Format: `at-uri` |
| `cid` | `string` | ❌  |  | Format: `cid` |
| `community_uri` | `string` | ❌  |  | Format: `at-uri` |
| `source_card_id` | `string` | ✅  |  |  |
| `target_card_id` | `string` | ✅  |  |  |
| `relationship_type` | `string` | ✅  |  | Max Length: 64 |
| `author_did` | `string` | ✅  |  | Format: `did` |
| `created_at` | `string` | ✅  |  | Format: `datetime` |

---

<a name="contributionview"></a>
### `contributionView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `uri` | `string` | ❌  |  | Format: `at-uri` |
| `cid` | `string` | ❌  |  | Format: `cid` |
| `community_uri` | `string` | ✅  |  | Format: `at-uri` |
| `author_did` | `string` | ✅  |  | Format: `did` |
| `title` | `string` | ✅  |  | Max Length: 500 |
| `content` | `string` | ❌  |  | Max Length: 10000 |
| `source_uri` | `string` | ❌  |  | Format: `at-uri` |
| `source_url` | `string` | ❌  |  | Format: `uri` |
| `source_type` | `string` | ✅  |  | Max Length: 64 |
| `metadata` | `string` | ❌  |  | Max Length: 20000 |
| `status` | `string` | ✅  |  | Known Values: `pending`, `approved`, `rejected` |
| `approved_card_id` | `string` | ❌  |  |  |
| `created_at` | `string` | ✅  |  | Format: `datetime` |
| `decided_at` | `string` | ❌  |  | Format: `datetime` |
| `approve_count` | `integer` | ✅  |  | Min: 0 |
| `reject_count` | `integer` | ✅  |  | Min: 0 |
| `viewer_vote` | `string` | ❌  |  | Known Values: `approve`, `reject` |

---

<a name="graphview"></a>
### `graphView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `nodes` | Array of [`com.para.community.civicTree.defs#cardView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#cardView]]) | ✅  |  |  |
| `edges` | Array of [`com.para.community.civicTree.defs#relationshipView`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#relationshipView]]) | ✅  |  |  |

---

<a name="configview"></a>
### `configView`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `community_uri` | `string` | ✅  |  | Format: `at-uri` |
| `governance_mode` | `string` | ✅  |  | Known Values: `votes_sortition`, `moderator_gate` |
| `approvals_required` | `integer` | ✅  |  | Min: 1 |
| `approval_margin_required` | `integer` | ✅  |  | Min: 0 |
| `moderator_gate_enabled` | `boolean` | ❌  |  |  |
| `sortition_enabled` | `boolean` | ❌  |  |  |
| `updated_at` | `string` | ❌  |  | Format: `datetime` |

---

<a name="cardvoteview"></a>
### `cardVoteView`

**Type:** `object`

A viewer's own influence vote on a card.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `influence` | `integer` | ✅  |  | Min: -3<br/>Max: 3 |

---

<a name="stancedistribution"></a>
### `stanceDistribution`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `pro` | `integer` | ✅  |  |  |
| `con` | `integer` | ✅  |  |  |
| `neutral` | `integer` | ✅  |  |  |

---

<a name="normalizedclaim"></a>
### `normalizedClaim`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `claim` | `string` | ✅  |  |  |
| `stance` | `string` | ✅  |  | Known Values: `support`, `oppose`, `unsure`, `amendment`, `needs_evidence` |
| `sourceType` | `string` | ✅  |  |  |
| `sourceId` | `string` | ❌  |  |  |

---

<a name="tensionline"></a>
### `tensionLine`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `axis` | `string` | ✅  |  |  |
| `summary` | `string` | ✅  |  |  |
| `sides` | Array of `string` | ✅  |  |  |
| `relatedClaimIds` | Array of `string` | ❌  |  |  |

---

<a name="openquestion"></a>
### `openQuestion`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `question` | `string` | ✅  |  |  |
| `whyItMatters` | `string` | ✅  |  |  |
| `relatedClaimIds` | Array of `string` | ❌  |  |  |

---

<a name="consensusarea"></a>
### `consensusArea`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `topic` | `string` | ✅  |  |  |
| `claims` | Array of `string` | ✅  |  |  |

---

<a name="unresolvedconflict"></a>
### `unresolvedConflict`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `topic` | `string` | ✅  |  |  |
| `opposingClaims` | Array of `string` | ✅  |  |  |

---

<a name="summaryview"></a>
### `summaryView`

**Type:** `object`

Derived reading of a community civic tree: what is claimed, where it conflicts, and what remains open.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `normalizedClaims` | Array of [`com.para.community.civicTree.defs#normalizedClaim`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#normalizedClaim]]) | ✅  |  |  |
| `tensionLines` | Array of [`com.para.community.civicTree.defs#tensionLine`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#tensionLine]]) | ✅  |  |  |
| `openQuestions` | Array of [`com.para.community.civicTree.defs#openQuestion`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#openQuestion]]) | ✅  |  |  |
| `consensusAreas` | Array of [`com.para.community.civicTree.defs#consensusArea`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#consensusArea]]) | ✅  |  |  |
| `unresolvedConflicts` | Array of [`com.para.community.civicTree.defs#unresolvedConflict`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#unresolvedConflict]]) | ✅  |  |  |
| `bridgeStatements` | Array of `string` | ✅  |  |  |
| `stanceDistribution` | [`com.para.community.civicTree.defs#stanceDistribution`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#stanceDistribution]]) | ✅  |  |  |
| `totalClaims` | `integer` | ✅  |  |  |
| `totalRelationships` | `integer` | ✅  |  |  |
| `generatedAt` | `string` | ✅  |  | Format: `datetime` |

---

<a name="topentity"></a>
### `topEntity`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `value` | `string` | ✅  |  |  |
| `type` | `string` | ✅  |  |  |
| `count` | `integer` | ✅  |  |  |

---

<a name="pulseclaim"></a>
### `pulseClaim`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `id` | `string` | ✅  |  |  |
| `title` | `string` | ✅  |  |  |
| `stance` | `string` | ❌  |  |  |
| `influence` | `integer` | ✅  |  |  |
| `voteCount` | `integer` | ✅  |  |  |
| `cardType` | `string` | ✅  |  |  |

---

<a name="pulseuserstats"></a>
### `pulseUserStats`

**Type:** `object`

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `votesCast` | `integer` | ✅  |  |  |
| `proVotes` | `integer` | ✅  |  |  |
| `conVotes` | `integer` | ✅  |  |  |
| `neutralVotes` | `integer` | ✅  |  |  |

---

<a name="pulseview"></a>
### `pulseView`

**Type:** `object`

Live activity signals for a community civic tree.

**Properties:**

| Name | Type | Req'd  | Description | Constraints |
|------|------|----------|-------------|-------------|
| `stanceDistribution` | [`com.para.community.civicTree.defs#stanceDistribution`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#stanceDistribution]]) | ✅  |  |  |
| `topEntities` | Array of [`com.para.community.civicTree.defs#topEntity`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#topEntity]]) | ✅  |  |  |
| `trendingClaims` | Array of [`com.para.community.civicTree.defs#pulseClaim`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#pulseClaim]]) | ✅  |  |  |
| `controversialClaims` | Array of [`com.para.community.civicTree.defs#pulseClaim`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#pulseClaim]]) | ✅  |  |  |
| `userStats` | [`com.para.community.civicTree.defs#pulseUserStats`]([[com-para-community-civictree-defs|com.para.community.civicTree.defs#pulseUserStats]]) | ❌  |  |  |

---

## Lexicon Source
```json
{
  "lexicon": 1,
  "id": "com.para.community.civicTree.defs",
  "defs": {
    "cardView": {
      "type": "object",
      "required": [
        "id",
        "community_uri",
        "author_did",
        "title",
        "card_type"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "community_uri": {
          "type": "string",
          "format": "at-uri"
        },
        "author_did": {
          "type": "string",
          "format": "did"
        },
        "title": {
          "type": "string",
          "maxLength": 500
        },
        "content": {
          "type": "string",
          "maxLength": 10000
        },
        "card_type": {
          "type": "string",
          "maxLength": 64
        },
        "source_uri": {
          "type": "string",
          "format": "at-uri"
        },
        "source_url": {
          "type": "string",
          "format": "uri"
        },
        "metadata": {
          "type": "string",
          "maxLength": 20000
        },
        "influence": {
          "type": "integer"
        },
        "vote_count": {
          "type": "integer",
          "minimum": 0
        },
        "stance": {
          "type": "string",
          "knownValues": [
            "pro",
            "con",
            "neutral"
          ]
        },
        "compass_quadrant": {
          "type": "string",
          "maxLength": 64
        },
        "created_at": {
          "type": "string",
          "format": "datetime"
        },
        "updated_at": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "relationshipView": {
      "type": "object",
      "required": [
        "id",
        "source_card_id",
        "target_card_id",
        "relationship_type",
        "author_did",
        "created_at"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "community_uri": {
          "type": "string",
          "format": "at-uri"
        },
        "source_card_id": {
          "type": "string"
        },
        "target_card_id": {
          "type": "string"
        },
        "relationship_type": {
          "type": "string",
          "maxLength": 64
        },
        "author_did": {
          "type": "string",
          "format": "did"
        },
        "created_at": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "contributionView": {
      "type": "object",
      "required": [
        "id",
        "community_uri",
        "author_did",
        "title",
        "source_type",
        "status",
        "created_at",
        "approve_count",
        "reject_count"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "uri": {
          "type": "string",
          "format": "at-uri"
        },
        "cid": {
          "type": "string",
          "format": "cid"
        },
        "community_uri": {
          "type": "string",
          "format": "at-uri"
        },
        "author_did": {
          "type": "string",
          "format": "did"
        },
        "title": {
          "type": "string",
          "maxLength": 500
        },
        "content": {
          "type": "string",
          "maxLength": 10000
        },
        "source_uri": {
          "type": "string",
          "format": "at-uri"
        },
        "source_url": {
          "type": "string",
          "format": "uri"
        },
        "source_type": {
          "type": "string",
          "maxLength": 64
        },
        "metadata": {
          "type": "string",
          "maxLength": 20000
        },
        "status": {
          "type": "string",
          "knownValues": [
            "pending",
            "approved",
            "rejected"
          ]
        },
        "approved_card_id": {
          "type": "string"
        },
        "created_at": {
          "type": "string",
          "format": "datetime"
        },
        "decided_at": {
          "type": "string",
          "format": "datetime"
        },
        "approve_count": {
          "type": "integer",
          "minimum": 0
        },
        "reject_count": {
          "type": "integer",
          "minimum": 0
        },
        "viewer_vote": {
          "type": "string",
          "knownValues": [
            "approve",
            "reject"
          ]
        }
      }
    },
    "graphView": {
      "type": "object",
      "required": [
        "nodes",
        "edges"
      ],
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#cardView"
          }
        },
        "edges": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#relationshipView"
          }
        }
      }
    },
    "configView": {
      "type": "object",
      "required": [
        "community_uri",
        "governance_mode",
        "approvals_required",
        "approval_margin_required"
      ],
      "properties": {
        "community_uri": {
          "type": "string",
          "format": "at-uri"
        },
        "governance_mode": {
          "type": "string",
          "knownValues": [
            "votes_sortition",
            "moderator_gate"
          ]
        },
        "approvals_required": {
          "type": "integer",
          "minimum": 1
        },
        "approval_margin_required": {
          "type": "integer",
          "minimum": 0
        },
        "moderator_gate_enabled": {
          "type": "boolean"
        },
        "sortition_enabled": {
          "type": "boolean"
        },
        "updated_at": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "cardVoteView": {
      "type": "object",
      "description": "A viewer's own influence vote on a card.",
      "required": [
        "influence"
      ],
      "properties": {
        "influence": {
          "type": "integer",
          "minimum": -3,
          "maximum": 3
        }
      }
    },
    "stanceDistribution": {
      "type": "object",
      "required": [
        "pro",
        "con",
        "neutral"
      ],
      "properties": {
        "pro": {
          "type": "integer"
        },
        "con": {
          "type": "integer"
        },
        "neutral": {
          "type": "integer"
        }
      }
    },
    "normalizedClaim": {
      "type": "object",
      "required": [
        "claim",
        "stance",
        "sourceType"
      ],
      "properties": {
        "claim": {
          "type": "string"
        },
        "stance": {
          "type": "string",
          "knownValues": [
            "support",
            "oppose",
            "unsure",
            "amendment",
            "needs_evidence"
          ]
        },
        "sourceType": {
          "type": "string"
        },
        "sourceId": {
          "type": "string"
        }
      }
    },
    "tensionLine": {
      "type": "object",
      "required": [
        "axis",
        "summary",
        "sides"
      ],
      "properties": {
        "axis": {
          "type": "string"
        },
        "summary": {
          "type": "string"
        },
        "sides": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "relatedClaimIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "openQuestion": {
      "type": "object",
      "required": [
        "question",
        "whyItMatters"
      ],
      "properties": {
        "question": {
          "type": "string"
        },
        "whyItMatters": {
          "type": "string"
        },
        "relatedClaimIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "consensusArea": {
      "type": "object",
      "required": [
        "topic",
        "claims"
      ],
      "properties": {
        "topic": {
          "type": "string"
        },
        "claims": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "unresolvedConflict": {
      "type": "object",
      "required": [
        "topic",
        "opposingClaims"
      ],
      "properties": {
        "topic": {
          "type": "string"
        },
        "opposingClaims": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "summaryView": {
      "type": "object",
      "description": "Derived reading of a community civic tree: what is claimed, where it conflicts, and what remains open.",
      "required": [
        "normalizedClaims",
        "tensionLines",
        "openQuestions",
        "consensusAreas",
        "unresolvedConflicts",
        "bridgeStatements",
        "stanceDistribution",
        "totalClaims",
        "totalRelationships",
        "generatedAt"
      ],
      "properties": {
        "normalizedClaims": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#normalizedClaim"
          }
        },
        "tensionLines": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#tensionLine"
          }
        },
        "openQuestions": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#openQuestion"
          }
        },
        "consensusAreas": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#consensusArea"
          }
        },
        "unresolvedConflicts": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#unresolvedConflict"
          }
        },
        "bridgeStatements": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "stanceDistribution": {
          "type": "ref",
          "ref": "com.para.community.civicTree.defs#stanceDistribution"
        },
        "totalClaims": {
          "type": "integer"
        },
        "totalRelationships": {
          "type": "integer"
        },
        "generatedAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    },
    "topEntity": {
      "type": "object",
      "required": [
        "value",
        "type",
        "count"
      ],
      "properties": {
        "value": {
          "type": "string"
        },
        "type": {
          "type": "string"
        },
        "count": {
          "type": "integer"
        }
      }
    },
    "pulseClaim": {
      "type": "object",
      "required": [
        "id",
        "title",
        "influence",
        "voteCount",
        "cardType"
      ],
      "properties": {
        "id": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "stance": {
          "type": "string"
        },
        "influence": {
          "type": "integer"
        },
        "voteCount": {
          "type": "integer"
        },
        "cardType": {
          "type": "string"
        }
      }
    },
    "pulseUserStats": {
      "type": "object",
      "required": [
        "votesCast",
        "proVotes",
        "conVotes",
        "neutralVotes"
      ],
      "properties": {
        "votesCast": {
          "type": "integer"
        },
        "proVotes": {
          "type": "integer"
        },
        "conVotes": {
          "type": "integer"
        },
        "neutralVotes": {
          "type": "integer"
        }
      }
    },
    "pulseView": {
      "type": "object",
      "description": "Live activity signals for a community civic tree.",
      "required": [
        "stanceDistribution",
        "topEntities",
        "trendingClaims",
        "controversialClaims"
      ],
      "properties": {
        "stanceDistribution": {
          "type": "ref",
          "ref": "com.para.community.civicTree.defs#stanceDistribution"
        },
        "topEntities": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#topEntity"
          }
        },
        "trendingClaims": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#pulseClaim"
          }
        },
        "controversialClaims": {
          "type": "array",
          "items": {
            "type": "ref",
            "ref": "com.para.community.civicTree.defs#pulseClaim"
          }
        },
        "userStats": {
          "type": "ref",
          "ref": "com.para.community.civicTree.defs#pulseUserStats"
        }
      }
    }
  }
}
```
