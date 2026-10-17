import type { LexiconDoc } from '@atproto/lexicon'

/*
 * Installed alongside the frozen generated registry (see
 * ../community/civicTree/schemas.ts for why). Keep in sync with
 * lexicons/com/para/civic/getPolicyCommunityVotes.json.
 */
export const civicSchemas: LexiconDoc[] = [
  {
    lexicon: 1,
    id: 'com.para.civic.getPolicyCommunityVotes',
    defs: {
      main: {
        type: 'query',
        description:
          'How the members of one community voted on a policy, from -3 to +3: who voted, how, and the community\'s average. The viewer must be an active member of that community.',
        parameters: {
          type: 'params',
          required: ['post', 'community'],
          properties: {
            post: { type: 'string', format: 'at-uri' },
            community: { type: 'string', maxLength: 1024 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [
              'community',
              'memberCount',
              'voterCount',
              'signalAverage',
              'breakdown',
              'votes',
            ],
            properties: {
              community: {
                type: 'ref',
                ref: 'com.para.civic.getPolicyCommunityVotes#communityRef',
              },
              memberCount: { type: 'integer', minimum: 0 },
              voterCount: { type: 'integer', minimum: 0 },
              signalAverage: { type: 'string', maxLength: 32 },
              breakdown: {
                type: 'array',
                maxLength: 7,
                items: {
                  type: 'ref',
                  ref: 'com.para.civic.defs#policySignalBucket',
                },
              },
              votes: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'com.para.civic.getPolicyCommunityVotes#memberVote',
                },
              },
            },
          },
        },
        errors: [{ name: 'NotFound' }, { name: 'CommunityMembershipRequired' }],
      },
      communityRef: {
        type: 'object',
        required: ['uri', 'name'],
        properties: {
          uri: { type: 'string', format: 'at-uri' },
          name: { type: 'string', maxLength: 200 },
        },
      },
      memberVote: {
        type: 'object',
        required: ['did', 'signal', 'createdAt'],
        properties: {
          did: { type: 'string', format: 'did' },
          handle: { type: 'string', maxLength: 253 },
          displayName: { type: 'string', maxLength: 640 },
          avatar: { type: 'string', format: 'uri' },
          signal: { type: 'integer', minimum: -3, maximum: 3 },
          createdAt: { type: 'string', format: 'datetime' },
        },
      },
    },
  },
]
