import type {
  ParaPolicyChange,
  ParaPolicyCheckpointReceipt,
  ParaPolicyOutbox,
} from './outbox.js'
import type {
  ParaPolicyRecoveryChallenge,
  PreparedParaPolicyUpdate,
} from './publisher.js'
import {
  type ParaPolicyTransportClient,
  ParaPolicyTransportError,
  type ParaPolicyTransportReceipt,
} from './transport-client.js'

export type ParaPolicyDeliveryStatus =
  | 'delivered'
  | 'empty'
  | 'busy'
  | 'recovery-required'
  | 'checkpoint-pending'
  /** The authenticated receiver did not confirm this exact artifact. */
  | 'receiver-lagged'
  /** The receiver rejected the artifact with a stream-conflict code. */
  | 'receiver-conflict'

export type ParaPolicyRecoveryStatus =
  | 'recovered'
  | 'recovered-reconciled'
  | 'nothing-to-recover'
  | 'checkpoint-unavailable'
  | 'checkpoint-busy'
  | 'checkpoint-expired'
  | 'receiver-lagged'

/**
 * Drives one delivery cycle of the durable outbox over the authenticated
 * transport: claim an artifact, deliver it, and only acknowledge after the
 * pinned PDS identity confirmed the exact version and digest of that
 * artifact. Checkpoint recovery follows the challenge -> prepare -> deliver
 * -> confirm sequence, falling back to receipt reconciliation when the
 * confirmation response was lost. No scheduler or loop lives here.
 */
export class ParaPolicyDeliveryCoordinator {
  constructor(
    private readonly deps: {
      outbox: ParaPolicyOutbox
      client: ParaPolicyTransportClient
      /** Must wrap the caller's governance transaction. */
      prepareCheckpoint: (
        eventId: string,
        challenge: ParaPolicyRecoveryChallenge,
        change: ParaPolicyChange,
      ) => Promise<PreparedParaPolicyUpdate>
    },
  ) {}

  async deliverNextUpdate(): Promise<ParaPolicyDeliveryStatus> {
    const delivery = await this.deps.outbox.claim()
    if (delivery.status !== 'claimed') return delivery.status
    let receipt: ParaPolicyTransportReceipt | null
    try {
      receipt = await this.deps.client.deliverDelta(delivery.update.assertion)
    } catch (error) {
      if (error instanceof ParaPolicyTransportError && error.status === 409) {
        return 'receiver-conflict'
      }
      throw error
    }
    if (!this.confirmsArtifact(receipt, delivery.update)) {
      return 'receiver-lagged'
    }
    const acknowledged = await this.deps.outbox.acknowledge(
      delivery.update.sourceVersion,
      delivery.update.projectionDigest,
      delivery.leaseToken,
    )
    return acknowledged ? 'delivered' : 'receiver-lagged'
  }

  async recoverWithCheckpoint(
    eventId: string,
    change: ParaPolicyChange,
  ): Promise<ParaPolicyRecoveryStatus> {
    const challenge = await this.deps.client.issueChallenge()
    if (!challenge) return 'nothing-to-recover'
    // @NOTE a challenge from a healthy receiver that is fully caught up
    // authorizes nothing: a checkpoint there would only burn a version.
    const state = await this.deps.outbox.streamState()
    if (
      state.deliveryStatus === 'ready' &&
      challenge.acceptedSourceVersion >= state.sourceVersion
    ) {
      return 'nothing-to-recover'
    }
    const prepared = await this.deps.prepareCheckpoint(
      eventId,
      challenge,
      change,
    )
    const claim = await this.deps.outbox.claimCheckpoint()
    if (claim.status !== 'claimed') {
      if (claim.status === 'busy') return 'checkpoint-busy'
      if (claim.status === 'expired') return 'checkpoint-expired'
      return 'checkpoint-unavailable'
    }
    let receipt: ParaPolicyTransportReceipt
    try {
      receipt = await this.deps.client.deliverCheckpoint(claim.update.assertion)
    } catch (error) {
      if (
        error instanceof ParaPolicyTransportError &&
        error.code === 'CheckpointChallengeConsumed'
      ) {
        return this.reconcileLostResponse(prepared, challenge)
      }
      throw error
    }
    if (
      !this.confirmsArtifact(receipt, prepared) ||
      receipt.challengeId !== challenge.id
    ) {
      return 'receiver-lagged'
    }
    const acknowledged = await this.deps.outbox.acknowledgeCheckpoint(
      prepared.sourceVersion,
      prepared.projectionDigest,
      challenge.id,
      claim.leaseToken,
    )
    return acknowledged ? 'recovered' : 'receiver-lagged'
  }

  private async reconcileLostResponse(
    prepared: PreparedParaPolicyUpdate,
    challenge: ParaPolicyRecoveryChallenge,
  ): Promise<ParaPolicyRecoveryStatus> {
    const receipt = await this.deps.client.checkpointReceipt()
    if (
      !receipt ||
      !this.confirmsArtifact(receipt, prepared) ||
      receipt.challengeId !== challenge.id ||
      receipt.policyEpoch === undefined ||
      receipt.installedAt === undefined
    ) {
      return 'receiver-lagged'
    }
    const acknowledged = await this.deps.outbox.reconcileCheckpoint(
      receipt as ParaPolicyCheckpointReceipt,
    )
    return acknowledged ? 'recovered-reconciled' : 'receiver-lagged'
  }

  private confirmsArtifact(
    receipt: ParaPolicyTransportReceipt | null,
    artifact: PreparedParaPolicyUpdate,
  ): boolean {
    return (
      receipt !== null &&
      receipt.sourceVersion === artifact.sourceVersion &&
      receipt.projectionDigest === artifact.projectionDigest
    )
  }
}
