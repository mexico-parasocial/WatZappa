/**
 * Enum of all gates in the system. This should be the single source of truth
 * for all gates, and should be used in all places where gates are checked or
 * defined.
 */
export enum Gate {
  SuggestedUsersDiscoverEnable = 'suggested_users:discover_agent:enable',
  SuggestedUsersSocialProofEnable = 'suggested_users:social_proof:enable',
  ThreadsReplyRankingExplorationEnable = 'threads:reply_ranking_exploration:enable',
  SearchFilteringExplorationEnable = 'search:filtering_exploration:enable',
  SuggestedUsersForExploreEnable = 'suggested_users:for_explore:enable',
  SuggestedUsersForDiscoverEnable = 'suggested_users:for_discover:enable',
  SuggestedUsersForSeeMoreEnable = 'suggested_users:for_see_more:enable',
  SearchV2Enable = 'search:v2:enable',
  IrisFeed = 'iris:feed:enable',
  OpThreadMetadataEnable = 'op_thread_metadata:enable',
  KnownLikersFeedEnable = 'known_likers:feed:enable',
  TrendingTopicsV2 = 'trending_topics_v2',

  /**
   * QV-LD: the quadratic tally, its audit trail and the ballot listings it
   * reads. In development and off by default — the canonical product does not
   * depend on it. See `src/api/com/para/community/quadratic-voting-gate.ts`.
   */
  ParaQuadraticVotingEnable = 'para:quadratic_voting:enable',

  // temp
  AATest = 'aa-test-appview',
}

/**
 * Set of gates that should be ignored when tracking gate evaluations for
 * analytics purposes. This is useful for gates that are not user-facing or are
 * overly noisy.
 */
export const IGNORE_METRICS_FOR_GATES: Set<Gate> = new Set([])
