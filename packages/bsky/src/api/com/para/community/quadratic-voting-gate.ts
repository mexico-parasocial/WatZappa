import type { Request } from 'express'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'

/**
 * Quadratic voting (QV-LD) is an experiment, not part of the canonical product:
 * it compares a flat tally, a √n tally and a correlation-adjusted one over the
 * same ballots so a voting system can be chosen on evidence. Its two inputs -
 * `com.para.community.vote` and `com.para.community.intensity` - are frozen
 * (OD-7 §5c), so it has no live data source and will not have one until the
 * replacement ballot of §5a/§5b exists.
 *
 * The feature flag is not a privacy boundary. Historical rows still identify
 * voters, and live aggregate differences can reveal individual ballots.
 * Reads remain frozen even when the experiment flag is enabled, until a
 * privacy-reviewed publication path replaces these tables (OD-7 §5a/§5b).
 */
export function assertQuadraticVotingEnabled(
  ctx: AppContext,
  { viewer, req }: { viewer: string | null; req: Request },
): void {
  const features = ctx.featureGatesClient.scope(
    ctx.featureGatesClient.parseUserContextFromHandler({ viewer, req }),
  )
  if (!features.checkGate(features.Gate.ParaQuadraticVotingEnable)) {
    throw new InvalidRequestError(
      'Quadratic voting is an experiment and is not enabled for this viewer',
      'FeatureNotEnabled',
    )
  }
  throw new InvalidRequestError(
    'Ballot statistics are unavailable until private aggregate publication is implemented',
    'BallotPrivacyUnavailable',
  )
}
