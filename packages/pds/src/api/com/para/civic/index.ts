import assert from 'node:assert'
import { TID } from '@atproto/common'
import type { AtUriString, DidString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { InvalidRecordError, prepareCreate } from '../../../../repo/index.js'
import { commitWrites, updateRepoRoot } from '../util.js'

const VOTE_COLLECTION = 'com.para.civic.vote'
const VOTING_PHASE = 'voting'
const VOTE_EDIT_WINDOW_MS = 5 * 60 * 1000
const VOTE_EDIT_GRACE_MS = 10 * 1000

/*
 * Casts a cabildeo ballot after checking, through the AppView, that the
 * cabildeo is in its voting phase and the voter is an active member of its
 * community. The m8 proof itself is verified by `prepareCreate` (the PDS-wide
 * ballot policy), which refuses the write if the verifier is unavailable.
 */
export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.civic.castVote, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'create',
          collection: VOTE_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const cabildeoUri = input.body.cabildeo
      const selectedOption = input.body.selectedOption
      const voteNullifier = normalizeOpaqueProofField(
        input.body.voteNullifier,
        128,
      )
      const eligibilityProofRef = normalizeOpaqueProofField(
        input.body.eligibilityProofRef,
        512,
      )
      if (!voteNullifier || !eligibilityProofRef) {
        throw new InvalidRequestError(
          'A vote nullifier and authorization proof are required',
          'InvalidVoteProof',
        )
      }
      const now = new Date()

      const cabildeo = await getCabildeoForVote(ctx, did, cabildeoUri)
      assertVoteAllowed(cabildeo, selectedOption, now)
      assertVoteEditWindow(cabildeo, now)
      await assertActiveCommunityMember(ctx, did, cabildeo.community)

      const write = await prepareCreate({
        did,
        collection: VOTE_COLLECTION,
        rkey: TID.nextStr(),
        record: {
          $type: VOTE_COLLECTION,
          subject: cabildeoUri,
          subjectType: 'cabildeo',
          cabildeo: cabildeoUri,
          selectedOption,
          isDirect: true,
          voteNullifier,
          eligibilityProofRef,
          createdAt: now.toISOString(),
        },
      }).catch((err) => {
        if (err instanceof InvalidRecordError) {
          throw new InvalidRequestError(err.message, 'InvalidVoteProof')
        }
        throw err
      })

      const commit = await ctx.actorStore.transact(did, (actorTxn) =>
        commitWrites(ctx, actorTxn, did, [write]),
      )
      await updateRepoRoot(ctx, did, commit, 'castVote')

      return {
        encoding: 'application/json',
        body: {
          uri: write.uri.toString() as AtUriString,
          cid: write.cid.toString(),
          commit: {
            cid: commit.cid.toString(),
            rev: commit.rev,
          },
        },
      }
    },
  })
}

const assertVoteEditWindow = (
  cabildeo: {
    viewerContext?: {
      currentVoteIsDirect?: boolean
      currentVoteCreatedAt?: string
    }
  },
  now: Date,
) => {
  const currentVoteCreatedAt = cabildeo.viewerContext?.currentVoteCreatedAt
  if (!cabildeo.viewerContext?.currentVoteIsDirect || !currentVoteCreatedAt) {
    return
  }

  const votedAt = new Date(currentVoteCreatedAt).getTime()
  if (!Number.isFinite(votedAt)) return

  const editDeadline = votedAt + VOTE_EDIT_WINDOW_MS + VOTE_EDIT_GRACE_MS
  if (now.getTime() > editDeadline) {
    throw new InvalidRequestError(
      'Vote edit window has expired',
      'VoteEditWindowExpired',
    )
  }
}

const getCabildeoForVote = async (
  ctx: AppContext,
  did: DidString,
  cabildeoUri: AtUriString,
) => {
  assert(ctx.bskyAppView)
  const res = await ctx.bskyAppView.client
    .call(
      com.para.civic.getCabildeo,
      { cabildeo: cabildeoUri },
      await ctx.appviewAuthHeaders(did, com.para.civic.getCabildeo.$lxm),
    )
    .catch((err) => {
      throw new InvalidRequestError(
        err?.message || 'Cabildeo not found',
        'NotFound',
      )
    })

  if (!res?.cabildeo) {
    throw new InvalidRequestError('Cabildeo not found', 'NotFound')
  }
  return res.cabildeo
}

const assertVoteAllowed = (
  cabildeo: {
    phase?: string
    phaseDeadline?: string
    options?: unknown[]
  },
  selectedOption: number,
  now: Date,
) => {
  if (cabildeo.phase !== VOTING_PHASE) {
    throw new InvalidRequestError(
      'Cabildeo is not in voting phase',
      'InvalidPhase',
    )
  }
  if (cabildeo.phaseDeadline && new Date(cabildeo.phaseDeadline) <= now) {
    throw new InvalidRequestError(
      'Voting deadline has passed',
      'DeadlineExpired',
    )
  }
  if (
    !Number.isInteger(selectedOption) ||
    selectedOption < 0 ||
    !Array.isArray(cabildeo.options) ||
    selectedOption >= cabildeo.options.length
  ) {
    throw new InvalidRequestError('Invalid vote option', 'InvalidOption')
  }
}

const assertActiveCommunityMember = async (
  ctx: AppContext,
  did: DidString,
  community: string,
) => {
  const communityId = normalizeCommunitySlug(community)
  assert(ctx.bskyAppView)
  const res = await ctx.bskyAppView.client
    .call(
      com.para.community.getBoard,
      { communityId },
      await ctx.appviewAuthHeaders(did, com.para.community.getBoard.$lxm),
    )
    .catch(() => null)

  if (res?.board?.viewerMembershipState !== 'active') {
    throw new InvalidRequestError(
      'Active community membership is required',
      'CommunityMembershipRequired',
    )
  }
}

const normalizeCommunitySlug = (value: string) =>
  value
    .replace(/^p\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return undefined
  return trimmed
}
