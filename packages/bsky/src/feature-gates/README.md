# Feature Gates

A thin wrapper around [GrowthBook](https://www.growthbook.io/) for feature flag
evaluation and experiment tracking.

## Usage

Feature gates are accessible on `HydrationCtx` as `features`. A default "scope"
is defined in `Hydrator.createContext`, which is called by every request
handler. The default scope supplies anonymous `deviceId` and `sessionId`
identifiers for targeting unauthenticated users.

Feature gates can be checked via the following methods.

```typescript
// check a single gate
const enabled = ctx.features.checkGate(
  ctx.features.Gate.ThreadsReplyRankingExplorationEnable,
)

// check multiple gates
const gates = ctx.features.checkGates([
  ctx.features.Gate.ThreadsReplyRankingExplorationEnable,
  ctx.features.Gate.SomeOtherGate,
])
const enabled = gates.get(
  ctx.features.Gate.ThreadsReplyRankingExplorationEnable,
)
```

### User Context

To accurately gate features by user, we need additional context about that user.
For most use cases, we get this data from within the request handlers.

Here, the `features` client will be scoped to the current user, allowing for
accurate gate checks throughout the request lifecycle.

```typescript
const features: ScopedFeatureGatesClient = ctx.featureGatesClient.scope(
  ctx.featureGatesClient.parseUserContextFromHandler({
    viewer,
    req,
  }),
)

const hydrateCtx = await ctx.hydrator.createContext({
  labelers,
  viewer,
  features,
})
```

> [!NOTE]
> Although `ctx.featureGatesClient` also has a `checkGates` method, the
> intention is to use the `ScopedFeatureGatesClient` returned by `scope()` for
> gate checks within the application.

`checkGates` on the client itself is private, so a gate check always goes
through `scope()`. Its `checkGate`/`checkGates` accept user context overrides,
which take precedence over the scope, for cases where the relevant user is only
known at the point of evaluation.

```typescript
const features = ctx.featureGatesClient.scope(
  ctx.featureGatesClient.parseUserContextFromHandler({ viewer, req }),
)
const enabled = features.checkGate(features.Gate.ImageFeatureEnabled, {
  did: imageAuthor.did,
})
```

Gate checks are synchronous, and return `false` when GrowthBook is unconfigured
or has not finished loading — a gated feature is off until it is deliberately
turned on.

### Adding Gates

See `gates.ts` and add them to the enum. You can optionally prevent metrics from
being emitted for a gate by adding the gate to the `IGNORE_METRICS_FOR_GATES`
set.

## Metrics

Check out the Growthbook docs for more info here. Basically, every feature eval
fires the `onFeatureUsage` callback. Any feature that is part of an experiment
_will also fire the `trackingCallback` callback._

For some use cases, this can be noisy and/or performance intensive, so make use
of `IGNORE_METRICS_FOR_GATES` to silence metrics for specific gates.
