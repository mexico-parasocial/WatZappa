import { Kysely } from 'kysely'
import * as activitySubscription from './tables/activity-subscription.js'
import * as actor from './tables/actor.js'
import * as actorBlock from './tables/actor-block.js'
import * as actorState from './tables/actor-state.js'
import * as actorSync from './tables/actor-sync.js'
import * as algo from './tables/algo.js'
import * as blobTakedown from './tables/blob-takedown.js'
import * as bookmark from './tables/bookmark.js'
import * as cabildeo from './tables/cabildeo.js'
import * as collection from './tables/collection.js'
import * as didCache from './tables/did-cache.js'
import * as discourse from './tables/discourse.js'
import * as draft from './tables/draft.js'
import * as duplicateRecord from './tables/duplicate-record.js'
import * as feedGenerator from './tables/feed-generator.js'
import * as feedItem from './tables/feed-item.js'
import * as follow from './tables/follow.js'
import * as highlight from './tables/highlight.js'
import * as label from './tables/label.js'
import * as labeler from './tables/labeler.js'
import * as like from './tables/like.js'
import * as list from './tables/list.js'
import * as listBlock from './tables/list-block.js'
import * as listItem from './tables/list-item.js'
import * as listMute from './tables/list-mute.js'
import * as mute from './tables/mute.js'
import * as notification from './tables/notification.js'
import * as notificationPushToken from './tables/notification-push-token.js'
import * as paraCommunityBoard from './tables/para-community-board.js'
import * as paraCommunityGovernance from './tables/para-community-governance.js'
import * as paraCommunityMembership from './tables/para-community-membership.js'
import * as paraCommunityRelation from './tables/para-community-relation.js'
import * as paraCommunitySharedContent from './tables/para-community-shared-content.js'
import * as paraCommunitySharedContentAction from './tables/para-community-shared-content-action.js'
import * as paraOpenQuestionVote from './tables/para-open-question-vote.js'
import * as paraPolicyVote from './tables/para-policy-vote.js'
import * as paraPost from './tables/para-post.js'
import * as paraPostMeta from './tables/para-post-meta.js'
import * as paraProfileStats from './tables/para-profile-stats.js'
import * as paraQvlDelegation from './tables/para-qvl-delegation.js'
import * as paraQvlDeliberationStatement from './tables/para-qvl-deliberation-statement.js'
import * as paraQvlDeliberationVote from './tables/para-qvl-deliberation-vote.js'
import * as paraQvlEigenstateSnapshot from './tables/para-qvl-eigenstate-snapshot.js'
import * as paraQvlGovernanceConfig from './tables/para-qvl-governance-config.js'
import * as paraQvlIntensity from './tables/para-qvl-intensity.js'
import * as paraQvlVote from './tables/para-qvl-vote.js'
import * as paraStatus from './tables/para-status.js'
import * as post from './tables/post.js'
import * as postAgg from './tables/post-agg.js'
import * as postEmbed from './tables/post-embed.js'
import * as postgate from './tables/post-gate.js'
import * as postSubscription from './tables/post-subscription.js'
import * as privateData from './tables/private-data.js'
import * as profile from './tables/profile.js'
import * as profileAgg from './tables/profile-agg.js'
import * as quote from './tables/quote.js'
import * as raqAssessment from './tables/raq-assessment.js'
import * as raqAxisVote from './tables/raq-axis-vote.js'
import * as raqProposal from './tables/raq-proposal.js'
import * as raqProposalAnswer from './tables/raq-proposal-answer.js'
import * as raqProposalVote from './tables/raq-proposal-vote.js'
import * as record from './tables/record.js'
import * as repost from './tables/repost.js'
import * as starterPack from './tables/starter-pack.js'
import * as subscription from './tables/subscription.js'
import * as suggestedFeed from './tables/suggested-feed.js'
import * as suggestedFollow from './tables/suggested-follow.js'
import * as taggedSuggestion from './tables/tagged-suggestion.js'
import * as threadgate from './tables/thread-gate.js'
import * as threadMute from './tables/thread-mute.js'
import * as verification from './tables/verification.js'
import * as viewParam from './tables/view-param.js'

export type DatabaseSchemaType = duplicateRecord.PartialDB &
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
  paraCommunityBoard.PartialDB &
  paraCommunityMembership.PartialDB &
  paraCommunityGovernance.PartialDB &
  paraCommunityRelation.PartialDB &
  paraCommunitySharedContent.PartialDB &
  paraCommunitySharedContentAction.PartialDB &
  paraQvlDeliberationStatement.PartialDB &
  paraQvlDeliberationVote.PartialDB &
  paraQvlEigenstateSnapshot.PartialDB &
  paraQvlDelegation.PartialDB &
  paraQvlGovernanceConfig.PartialDB &
  paraQvlIntensity.PartialDB &
  paraQvlVote.PartialDB &
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
