import type { LexiconDoc } from '@atproto/lexicon'

/*
 * The appview's generated lexicon registry (src/lexicon/lexicons.ts) predates
 * these lexicons and can no longer be regenerated: the lexgen toolchain that
 * produced it was replaced by `@atproto/lex build`, which writes the runtime
 * schema tree under src/lexicons/ instead. Until the server is migrated onto
 * that tree, these procedure schemas are installed alongside the generated
 * ones so `server.xrpc.method()` can register them. Keep in sync with:
 *   lexicons/com/para/community/civicTree/{list,submit,vote}*.json
 *   lexicons/com/para/community/civicTree/createRelationship.json
 */
export const civicTreeProcedureSchemas: LexiconDoc[] = [
  /*
   * The view refs used by the procedure outputs below must resolve against an
   * installed def, so the three views in play are mirrored here from:
   *   lexicons/com/para/community/civicTree/defs.json
   */
  {
    lexicon: 1,
    id: 'com.para.community.civicTree.defs',
    defs: {
      cardView: {
        type: 'object',
        required: ['id', 'community_uri', 'author_did', 'title', 'card_type'],
        properties: {
          id: { type: 'string' },
          uri: { type: 'string', format: 'at-uri' },
          cid: { type: 'string', format: 'cid' },
          community_uri: { type: 'string', format: 'at-uri' },
          author_did: { type: 'string', format: 'did' },
          title: { type: 'string', maxLength: 500 },
          content: { type: 'string', maxLength: 10000 },
          card_type: { type: 'string', maxLength: 64 },
          source_uri: { type: 'string', format: 'at-uri' },
          source_url: { type: 'string', format: 'uri' },
          metadata: { type: 'string', maxLength: 20000 },
          influence: { type: 'integer' },
          vote_count: { type: 'integer', minimum: 0 },
          stance: {
            type: 'string',
            knownValues: ['pro', 'con', 'neutral'],
          },
          compass_quadrant: { type: 'string', maxLength: 64 },
          created_at: { type: 'string', format: 'datetime' },
          updated_at: { type: 'string', format: 'datetime' },
        },
      },
      relationshipView: {
        type: 'object',
        required: [
          'id',
          'source_card_id',
          'target_card_id',
          'relationship_type',
          'author_did',
          'created_at',
        ],
        properties: {
          id: { type: 'string' },
          uri: { type: 'string', format: 'at-uri' },
          cid: { type: 'string', format: 'cid' },
          community_uri: { type: 'string', format: 'at-uri' },
          source_card_id: { type: 'string' },
          target_card_id: { type: 'string' },
          relationship_type: { type: 'string', maxLength: 64 },
          author_did: { type: 'string', format: 'did' },
          created_at: { type: 'string', format: 'datetime' },
        },
      },
      contributionView: {
        type: 'object',
        required: [
          'id',
          'community_uri',
          'author_did',
          'title',
          'source_type',
          'status',
          'created_at',
          'approve_count',
          'reject_count',
        ],
        properties: {
          id: { type: 'string' },
          uri: { type: 'string', format: 'at-uri' },
          cid: { type: 'string', format: 'cid' },
          community_uri: { type: 'string', format: 'at-uri' },
          author_did: { type: 'string', format: 'did' },
          title: { type: 'string', maxLength: 500 },
          content: { type: 'string', maxLength: 10000 },
          source_uri: { type: 'string', format: 'at-uri' },
          source_url: { type: 'string', format: 'uri' },
          source_type: { type: 'string', maxLength: 64 },
          metadata: { type: 'string', maxLength: 20000 },
          status: {
            type: 'string',
            knownValues: ['pending', 'approved', 'rejected'],
          },
          approved_card_id: { type: 'string' },
          created_at: { type: 'string', format: 'datetime' },
          decided_at: { type: 'string', format: 'datetime' },
          approve_count: { type: 'integer', minimum: 0 },
          reject_count: { type: 'integer', minimum: 0 },
          viewer_vote: {
            type: 'string',
            knownValues: ['approve', 'reject'],
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.para.community.civicTree.listContributions',
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['community'],
          properties: {
            community: { type: 'string', format: 'at-uri' },
            status: {
              type: 'string',
              knownValues: ['pending', 'approved', 'rejected'],
            },
            viewer: { type: 'string', format: 'did' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['contributions'],
            properties: {
              cursor: { type: 'string' },
              contributions: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'com.para.community.civicTree.defs#contributionView',
                },
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.para.community.civicTree.submitContribution',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['communityUri', 'authorDid', 'title', 'sourceType'],
            properties: {
              communityUri: { type: 'string', format: 'at-uri' },
              authorDid: { type: 'string', format: 'did' },
              title: { type: 'string', maxLength: 500 },
              content: { type: 'string', maxLength: 10000 },
              sourceUri: { type: 'string', format: 'at-uri' },
              sourceUrl: { type: 'string', format: 'uri' },
              sourceType: { type: 'string', maxLength: 64 },
              metadata: { type: 'string', maxLength: 20000 },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['contribution'],
            properties: {
              contribution: {
                type: 'ref',
                ref: 'com.para.community.civicTree.defs#contributionView',
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.para.community.civicTree.voteContribution',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['contribution', 'voterDid', 'vote'],
            properties: {
              contribution: { type: 'string' },
              voterDid: { type: 'string', format: 'did' },
              vote: { type: 'string', knownValues: ['approve', 'reject'] },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['contribution'],
            properties: {
              contribution: {
                type: 'ref',
                ref: 'com.para.community.civicTree.defs#contributionView',
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.para.community.civicTree.createRelationship',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [
              'communityUri',
              'sourceCardId',
              'targetCardId',
              'relationshipType',
              'authorDid',
            ],
            properties: {
              communityUri: { type: 'string', format: 'at-uri' },
              sourceCardId: { type: 'string' },
              targetCardId: { type: 'string' },
              relationshipType: { type: 'string', maxLength: 64 },
              authorDid: { type: 'string', format: 'did' },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['relationship'],
            properties: {
              relationship: {
                type: 'ref',
                ref: 'com.para.community.civicTree.defs#relationshipView',
              },
            },
          },
        },
      },
    },
  },
]
