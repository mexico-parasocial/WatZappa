import type { LexiconDoc } from '@atproto/lexicon'

/*
 * Installed alongside the frozen generated registry (see
 * ../civicTree/schemas.ts for why). Copies of
 * lexicons/com/para/community/{listActivities,getActivity,listWikiPages}.json;
 * tests/para-community-activities.test.ts fails if they drift.
 */
export const communityActivitySchemas = [
  {
    "lexicon": 1,
    "id": "com.para.community.listActivities",
    "defs": {
      "main": {
        "type": "query",
        "description": "Lists community activities published by each community's current organizers. Records written by anyone else are not listed.",
        "parameters": {
          "type": "params",
          "properties": {
            "community": {
              "type": "string",
              "format": "at-uri",
              "description": "Board URI. Omit to list across all communities."
            },
            "category": {
              "type": "string",
              "knownValues": [
                "social",
                "economic"
              ]
            },
            "time": {
              "type": "string",
              "knownValues": [
                "upcoming",
                "past",
                "any"
              ],
              "default": "any",
              "description": "upcoming: not completed or cancelled, and in progress or not yet ended. past: everything else."
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 25
            },
            "cursor": {
              "type": "string",
              "maxLength": 512
            }
          }
        },
        "output": {
          "encoding": "application/json",
          "schema": {
            "type": "object",
            "required": [
              "activities"
            ],
            "properties": {
              "activities": {
                "type": "array",
                "items": {
                  "type": "ref",
                  "ref": "#activityView"
                }
              },
              "cursor": {
                "type": "string"
              }
            }
          }
        }
      },
      "activityView": {
        "type": "object",
        "description": "An activity published for a community by one of its current organizers (its board's creator, or an owner or moderator by verified authority events).",
        "required": [
          "uri",
          "cid",
          "author",
          "category",
          "communityUri",
          "record",
          "indexedAt"
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
          "author": {
            "type": "string",
            "format": "did"
          },
          "category": {
            "type": "string",
            "knownValues": [
              "social",
              "economic"
            ]
          },
          "communityUri": {
            "type": "string",
            "format": "at-uri"
          },
          "communityName": {
            "type": "string",
            "maxLength": 640
          },
          "record": {
            "type": "unknown",
            "description": "The com.para.community.socialActivity or economicActivity record."
          },
          "indexedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "com.para.community.getActivity",
    "defs": {
      "main": {
        "type": "query",
        "description": "Gets one community activity and, for economic activities, its ledger entries recorded by the community's current organizers.",
        "parameters": {
          "type": "params",
          "required": [
            "uri"
          ],
          "properties": {
            "uri": {
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
              "activity",
              "ledger"
            ],
            "properties": {
              "activity": {
                "type": "ref",
                "ref": "com.para.community.listActivities#activityView"
              },
              "ledger": {
                "type": "array",
                "items": {
                  "type": "ref",
                  "ref": "#ledgerEntryView"
                }
              }
            }
          }
        },
        "errors": [
          {
            "name": "NotFound",
            "description": "No such activity, or its author is not an organizer of the community."
          }
        ]
      },
      "ledgerEntryView": {
        "type": "object",
        "required": [
          "uri",
          "cid",
          "author",
          "record",
          "indexedAt"
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
          "author": {
            "type": "string",
            "format": "did"
          },
          "record": {
            "type": "unknown",
            "description": "The com.para.community.activityLedgerEntry record."
          },
          "indexedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "com.para.community.listWikiPages",
    "defs": {
      "main": {
        "type": "query",
        "description": "Lists a community's wiki pages and megathreads, as published by its current organizers. When several organizers publish the same slug, the most recently updated page wins.",
        "parameters": {
          "type": "params",
          "required": [
            "community"
          ],
          "properties": {
            "community": {
              "type": "string",
              "format": "at-uri"
            },
            "kind": {
              "type": "string",
              "knownValues": [
                "page",
                "megathread"
              ]
            }
          }
        },
        "output": {
          "encoding": "application/json",
          "schema": {
            "type": "object",
            "required": [
              "pages"
            ],
            "properties": {
              "pages": {
                "type": "array",
                "items": {
                  "type": "ref",
                  "ref": "#wikiPageView"
                }
              }
            }
          }
        }
      },
      "wikiPageView": {
        "type": "object",
        "required": [
          "uri",
          "cid",
          "author",
          "record",
          "indexedAt"
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
          "author": {
            "type": "string",
            "format": "did"
          },
          "record": {
            "type": "unknown",
            "description": "The com.para.community.wikiPage record."
          },
          "indexedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
] as unknown as LexiconDoc[]
