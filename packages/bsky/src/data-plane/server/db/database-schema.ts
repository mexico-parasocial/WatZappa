import type { Kysely } from 'kysely'
import type * as activitySubscription from './tables/activity-subscription.js'
import type * as actorBlock from './tables/actor-block.js'
import type * as actorState from './tables/actor-state.js'
import type * as actorSync from './tables/actor-sync.js'
import type * as actor from './tables/actor.js'
import type * as algo from './tables/algo.js'
import type * as blobTakedown from './tables/blob-takedown.js'
import type * as bookmark from './tables/bookmark.js'
import type * as cabildeo from './tables/cabildeo.js'
import type * as collection from './tables/collection.js'
import type * as didCache from './tables/did-cache.js'
import type * as discourse from './tables/discourse.js'
import type * as draft from './tables/draft.js'
import type * as duplicateRecord from './tables/duplicate-record.js'
import type * as feedGenerator from './tables/feed-generator.js'
import type * as feedItem from './tables/feed-item.js'
import type * as follow from './tables/follow.js'
import type * as highlight from './tables/highlight.js'
import type * as label from './tables/label.js'
import type * as labeler from './tables/labeler.js'
import type * as like from './tables/like.js'
import type * as listBlock from './tables/list-block.js'
import type * as listItem from './tables/list-item.js'
import type * as listMute from './tables/list-mute.js'
import type * as list from './tables/list.js'
import type * as mute from './tables/mute.js'
import type * as notificationPushToken from './tables/notification-push-token.js'
import type * as notification from './tables/notification.js'
import type * as paraCommunityAccount from './tables/para-community-account.js'
import type * as paraCommunityActivity from './tables/para-community-activity.js'
import type * as paraCommunityBriefingPack from './tables/para-community-briefing-pack.js'
import type * as paraCommunityCivicTreeCard from './tables/para-community-civic-tree-card.js'
import type * as paraCommunityCivicTreeContributionVote from './tables/para-community-civic-tree-contribution-vote.js'
import type * as paraCommunityCivicTreeContribution from './tables/para-community-civic-tree-contribution.js'
import type * as paraCommunityCivicTreeRelationship from './tables/para-community-civic-tree-relationship.js'
import type * as paraCommunitySharedContent from './tables/para-community-shared-content.js'
import type * as paraConclusion from './tables/para-conclusion.js'
import type * as paraDeliberationStatement from './tables/para-deliberation-statement.js'
import type * as paraDeliberationVote from './tables/para-deliberation-vote.js'
import type * as paraFollowThrough from './tables/para-follow-through.js'
import type * as paraOpenQuestionVote from './tables/para-open-question-vote.js'
import type * as paraPolicyVote from './tables/para-policy-vote.js'
import type * as paraPostMeta from './tables/para-post-meta.js'
import type * as paraPost from './tables/para-post.js'
import type * as paraProfileStats from './tables/para-profile-stats.js'
import type * as paraQvlCivicTreeStatement from './tables/para-qvl-civic-tree-statement.js'
import type * as paraQvlCivicTreeVote from './tables/para-qvl-civic-tree-vote.js'
import type * as paraQvlDelegation from './tables/para-qvl-delegation.js'
import type * as paraQvlEigenstateSnapshot from './tables/para-qvl-eigenstate-snapshot.js'
import type * as paraQvlGovernanceConfig from './tables/para-qvl-governance-config.js'
import type * as paraQvlIntensity from './tables/para-qvl-intensity.js'
import type * as paraQvlVote from './tables/para-qvl-vote.js'
import type * as paraStatus from './tables/para-status.js'
import type * as postAgg from './tables/post-agg.js'
import type * as postEmbed from './tables/post-embed.js'
import type * as postgate from './tables/post-gate.js'
import type * as postSubscription from './tables/post-subscription.js'
import type * as post from './tables/post.js'
import type * as privateData from './tables/private-data.js'
import type * as profileAgg from './tables/profile-agg.js'
import type * as profile from './tables/profile.js'
import type * as quote from './tables/quote.js'
import type * as raqAssessment from './tables/raq-assessment.js'
import type * as raqAxisVote from './tables/raq-axis-vote.js'
import type * as raqProposalAnswer from './tables/raq-proposal-answer.js'
import type * as raqProposalVote from './tables/raq-proposal-vote.js'
import type * as raqProposal from './tables/raq-proposal.js'
import type * as record from './tables/record.js'
import type * as referenceListOptOut from './tables/reference-list-opt-out.js'
import type * as repost from './tables/repost.js'
import type * as starterPack from './tables/starter-pack.js'
import type * as subscription from './tables/subscription.js'
import type * as suggestedFeed from './tables/suggested-feed.js'
import type * as suggestedFollow from './tables/suggested-follow.js'
import type * as taggedSuggestion from './tables/tagged-suggestion.js'
import type * as threadgate from './tables/thread-gate.js'
import type * as threadMute from './tables/thread-mute.js'
import type * as verification from './tables/verification.js'
import type * as viewParam from './tables/view-param.js'

export type DatabaseSchemaType = duplicateRecord.PartialDB &
  referenceListOptOut.PartialDB &
  profile.PartialDB &
  profileAgg.PartialDB &
  post.PartialDB &
  postSubscription.PartialDB &
  postEmbed.PartialDB &
  postAgg.PartialDB &
  repost.PartialDB &
  threadgate.PartialDB &
  postgate.PartialDB &
  feedItem.PartialDB &
  follow.PartialDB &
  like.PartialDB &
  list.PartialDB &
  listItem.PartialDB &
  listMute.PartialDB &
  listBlock.PartialDB &
  mute.PartialDB &
  actorBlock.PartialDB &
  threadMute.PartialDB &
  feedGenerator.PartialDB &
  subscription.PartialDB &
  actor.PartialDB &
  actorState.PartialDB &
  actorSync.PartialDB &
  record.PartialDB &
  notification.PartialDB &
  notificationPushToken.PartialDB &
  didCache.PartialDB &
  label.PartialDB &
  algo.PartialDB &
  viewParam.PartialDB &
  suggestedFollow.PartialDB &
  suggestedFeed.PartialDB &
  blobTakedown.PartialDB &
  labeler.PartialDB &
  starterPack.PartialDB &
  taggedSuggestion.PartialDB &
  quote.PartialDB &
  verification.PartialDB &
  privateData.PartialDB &
  activitySubscription.PartialDB &
  bookmark.PartialDB &
  draft.PartialDB &
  paraCommunityAccount.PartialDB &
  paraConclusion.PartialDB &
  paraCommunityBriefingPack.PartialDB &
  paraCommunityActivity.PartialDB &
  paraFollowThrough.PartialDB &
  paraCommunityCivicTreeCard.PartialDB &
  paraCommunityCivicTreeContribution.PartialDB &
  paraCommunityCivicTreeContributionVote.PartialDB &
  paraCommunityCivicTreeRelationship.PartialDB &
  paraCommunitySharedContent.PartialDB &
  paraQvlCivicTreeStatement.PartialDB &
  paraQvlCivicTreeVote.PartialDB &
  paraQvlEigenstateSnapshot.PartialDB &
  paraQvlDelegation.PartialDB &
  paraQvlGovernanceConfig.PartialDB &
  paraQvlIntensity.PartialDB &
  paraQvlVote.PartialDB &
  paraDeliberationStatement.PartialDB &
  paraDeliberationVote.PartialDB &
  paraPost.PartialDB &
  paraPostMeta.PartialDB &
  paraOpenQuestionVote.PartialDB &
  paraPolicyVote.PartialDB &
  paraStatus.PartialDB &
  paraProfileStats.PartialDB &
  highlight.PartialDB &
  cabildeo.PartialDB &
  discourse.PartialDB &
  collection.PartialDB &
  raqAssessment.PartialDB &
  raqAxisVote.PartialDB &
  raqProposal.PartialDB &
  raqProposalVote.PartialDB &
  raqProposalAnswer.PartialDB

export type DatabaseSchema = Kysely<DatabaseSchemaType>
