import type * as accountPref from './account-pref.js'
import type * as backlink from './backlink.js'
import type * as blob from './blob.js'
import type * as paraSpacePolicyChallenge from './para-space-policy-challenge.js'
import type * as paraSpacePolicyCheckpoint from './para-space-policy-checkpoint.js'
import type * as paraPolicyTransportReceipt from './para-policy-transport-receipt.js'
import type * as paraSpacePolicyDelta from './para-space-policy-delta.js'
import type * as paraSpacePolicyFault from './para-space-policy-fault.js'
import type * as paraSpacePolicyMember from './para-space-policy-member.js'
import type * as paraSpacePolicyState from './para-space-policy-state.js'
import type * as recordBlob from './record-blob.js'
import type * as record from './record.js'
import type * as repoBlock from './repo-block.js'
import type * as repoRoot from './repo-root.js'
import type * as simplespaceConfig from './simplespace-config.js'
import type * as simplespaceMember from './simplespace-member.js'
import type * as spaceCredentialRecipient from './space-credential-recipient.js'
import type * as spaceRecordBlob from './space-record-blob.js'
import type * as spaceRecordOplog from './space-record-oplog.js'
import type * as spaceRecord from './space-record.js'
import type * as spaceRepo from './space-repo.js'
import type * as spaceWriter from './space-writer.js'
import type * as space from './space.js'

export type DatabaseSchema = accountPref.PartialDB &
  repoRoot.PartialDB &
  record.PartialDB &
  backlink.PartialDB &
  repoBlock.PartialDB &
  blob.PartialDB &
  recordBlob.PartialDB &
  paraSpacePolicyChallenge.PartialDB &
  paraSpacePolicyCheckpoint.PartialDB &
  paraPolicyTransportReceipt.PartialDB &
  paraSpacePolicyDelta.PartialDB &
  paraSpacePolicyFault.PartialDB &
  paraSpacePolicyState.PartialDB &
  paraSpacePolicyMember.PartialDB &
  space.PartialDB &
  simplespaceConfig.PartialDB &
  simplespaceMember.PartialDB &
  spaceRecord.PartialDB &
  spaceRecordBlob.PartialDB &
  spaceRepo.PartialDB &
  spaceRecordOplog.PartialDB &
  spaceWriter.PartialDB &
  spaceCredentialRecipient.PartialDB

export type { AccountPref } from './account-pref.js'
export type { RepoRoot } from './repo-root.js'
export type { Record } from './record.js'
export type { Backlink } from './backlink.js'
export type { RepoBlock } from './repo-block.js'
export type { Blob } from './blob.js'
export type { RecordBlob } from './record-blob.js'
export type { ParaSpacePolicyChallenge } from './para-space-policy-challenge.js'
export type { ParaSpacePolicyCheckpoint } from './para-space-policy-checkpoint.js'
export type { ParaPolicyTransportReceipt } from './para-policy-transport-receipt.js'
export type { ParaSpacePolicyDelta } from './para-space-policy-delta.js'
export type { ParaSpacePolicyFault } from './para-space-policy-fault.js'
export type { ParaSpacePolicyState } from './para-space-policy-state.js'
export type { ParaSpacePolicyMember } from './para-space-policy-member.js'
export type { Space } from './space.js'
export type { SimplespaceConfig } from './simplespace-config.js'
export type { SimplespaceMember } from './simplespace-member.js'
export type { SpaceRecord } from './space-record.js'
export type { SpaceRecordBlob } from './space-record-blob.js'
export type { SpaceRepo } from './space-repo.js'
export type { SpaceRecordOplog } from './space-record-oplog.js'
export type { SpaceWriter } from './space-writer.js'
export type { SpaceCredentialRecipient } from './space-credential-recipient.js'
