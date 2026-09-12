# com.para XRPC surface

Inventory of the custom `com.para.*` methods and where they are implemented
and used. `packages/bsky/tests/para-lexicon-parity.test.ts` enforces that every
method lexicon under `lexicons/com/para/` is either registered on the AppView
or listed in [lexicon-exceptions.json](./lexicon-exceptions.json).

Implementation split follows the standard atproto topology:

- **PDS** (`packages/pds/src/api/com/para/`) — account-local features (alpha
  invite/rollout, auth factor) and proxied reads (feed, social, actor,
  community reads) using the same pipethrough/read-after-write pattern as
  `app.bsky.*`.
- **AppView** (`packages/bsky/src/api/com/para/`) — hydration-backed queries
  and procedures, served from the dataplane's PARA gRPC methods.

## AppView methods

| Method | In-repo callers |
| --- | --- |
| com.para.actor.getProfileStats | PDS proxy (`pds/src/api/com/para/actor`) |
| com.para.actor.getSuggestedUsers | external (frontend) |
| com.para.actor.exportCivicTree | `bsky/tests/views/para-civic-tree-export.test.ts` |
| com.para.agent.getConversation / sendMessage | external (frontend) |
| com.para.alpha.getAccess / getRolloutStatus | external (frontend); PDS mirrors read-only |
| com.para.civic.getCabildeo, getOpenQuestionThread, getPolicyTally, listCabildeos, listCabildeoPositions, listDelegationCandidates | external (frontend); getCabildeo/getBoard also called by PDS `civic/castVote` |
| com.para.civic.putLivePresence | `bsky/tests/data-plane/post-subscriptions.test.ts` |
| com.para.collection.* (5 methods) | external (frontend) |
| com.para.community.* (~25 list/get queries) | mostly external (frontend); getBoard via PDS proxy + `castVote`; a subset covered by `bsky/tests/qvl-*`, `views/*` |
| com.para.community.civicTree.{listContributions, submitContribution, voteContribution, createRelationship} | `bsky/tests/views/para-civic-tree-export.test.ts` and civicTree tests |
| com.para.discourse.getSnapshot / getTopics / getTopology | external (frontend) |
| com.para.feed.getTimeline / getPosts / getPostThread / searchPosts | `bsky/tests/views/para-feed*.test.ts`; PDS feed proxies |
| com.para.feed.getMemes, getAuthorFeed | external (frontend) |
| com.para.highlight.* | external (frontend) |
| com.para.notification.getPostSubscription / putPostSubscription | `bsky/tests/data-plane/post-subscriptions.test.ts` |
| com.para.raq.* | `bsky/tests/raq-indexing.test.ts` |
| com.para.social.getPostMeta | `bsky/tests/views/para-feed.test.ts`; PDS proxy |

## PDS-only methods

| Method | In-repo callers |
| --- | --- |
| com.para.account.getAuthFactor / setAuthFactor | external (frontend) |
| com.para.alpha.createInvite / requestAccess / getAccess | external (frontend) |
| com.para.alpha.getRolloutStatus | external (frontend, unauthenticated) |
| com.para.civic.castVote | external (frontend) — writes a `com.para.civic.vote` repo record |
| com.para.community.{join, leave, acceptDraftInvite, createBoard, createBriefingPack, updateBriefingPack, shareContent, removeSharedContent, restoreSharedContent} | `dev-env/src/seed/para-demo.ts` (createBoard, join); rest external (frontend) |

## Deliberately unimplemented (see lexicon-exceptions.json)

- 9 `com.para.community.civicTree` methods (`planned-civicTree`)
- `com.para.discourse.getAnalysis` (`planned-discourse`)

The dataplane already implements `GetParaDiscourseSentiment`
(`data-plane/server/routes/discourse.ts`); the former unregistered
`getSentiment` AppView handler was removed — re-add it with a lexicon if the
endpoint gets specced.
