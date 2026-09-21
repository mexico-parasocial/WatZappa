import type { Request } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext } from '../../../../context.js'
import { FeatureGatesClient } from '../../../../feature-gates/index.js'
import type { Server } from '../../../../lexicon/index.js'
import registerAudit from './getAuditTrail.js'
import registerTally from './getTallySimulation.js'
import registerIntensities from './listIntensities.js'
import registerVotes from './listVotes.js'
import { assertQuadraticVotingEnabled } from './quadratic-voting-gate.js'

const req = { header: () => undefined } as unknown as Request

const ctxWith = (featureGatesClient: FeatureGatesClient) =>
  ({ featureGatesClient }) as unknown as AppContext

describe('assertQuadraticVotingEnabled', () => {
  it('refuses when GrowthBook is not configured', () => {
    // The property that matters: an unconfigured or not-yet-ready client
    // evaluates every gate to false, so the experiment cannot be reached by
    // forgetting to configure it.
    const ctx = ctxWith(new FeatureGatesClient({}))
    expect(() =>
      assertQuadraticVotingEnabled(ctx, { viewer: null, req }),
    ).toThrow(/not enabled/)
  })

  it('refuses a signed-in viewer just the same', () => {
    const ctx = ctxWith(new FeatureGatesClient({}))
    expect(() =>
      assertQuadraticVotingEnabled(ctx, { viewer: 'did:plc:example', req }),
    ).toThrow(/not enabled/)
  })

  it.each([null, 'did:plc:example'])(
    'keeps historical ballots private with the flag enabled for %s',
    (viewer) => {
      const client = new FeatureGatesClient({})
      const features = client.scope({})
      using gate = vi.spyOn(features, 'checkGate').mockReturnValue(true)
      using scope = vi.spyOn(client, 'scope').mockReturnValue(features)
      expect(() =>
        assertQuadraticVotingEnabled(ctxWith(client), { viewer, req }),
      ).toThrow(expect.objectContaining({ error: 'BallotPrivacyUnavailable' }))
      expect(gate).toHaveBeenCalled()
      expect(scope).toHaveBeenCalled()
    },
  )

  it.each([
    ['listVotes', registerVotes],
    ['listIntensities', registerIntensities],
    ['getAuditTrail', registerAudit],
    ['getTallySimulation', registerTally],
  ] as const)(
    'blocks %s before reading the data plane',
    async (name, register) => {
      const client = new FeatureGatesClient({})
      const features = client.scope({})
      using gate = vi.spyOn(features, 'checkGate').mockReturnValue(true)
      using scope = vi.spyOn(client, 'scope').mockReturnValue(features)
      const read = vi.fn(() => {
        throw new Error('Sensitive data read')
      })
      let handler: (input: unknown) => Promise<unknown> = async () => {
        throw new Error('Handler was not registered')
      }
      const server = {
        com: {
          para: {
            community: {
              [name]: (config: { handler: typeof handler }) => {
                handler = config.handler
              },
            },
          },
        },
      } as unknown as Server
      const ctx = {
        featureGatesClient: client,
        authVerifier: { parseCreds: () => ({ viewer: 'did:plc:example' }) },
        dataplane: new Proxy({}, { get: () => read }),
      } as unknown as AppContext
      register(server, ctx)
      await expect(
        handler({
          params: { proposal: 'at://did:plc:p/com.para.community.proposal/1' },
          auth: {},
          req,
        }),
      ).rejects.toMatchObject({ error: 'BallotPrivacyUnavailable' })
      expect(read).not.toHaveBeenCalled()
      expect(gate).toHaveBeenCalled()
      expect(scope).toHaveBeenCalled()
    },
  )
})
