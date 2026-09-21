---
'@atproto/bsky': minor
---

Put QV-LD quadratic voting behind the GrowthBook gate `para:quadratic_voting:enable`, off by default. `com.para.community.listVotes`, `listIntensities`, `getTallySimulation` and `getAuditTrail` refuse with `FeatureNotEnabled` when the gate is off and with `BallotPrivacyUnavailable` when it is on, until a privacy-reviewed aggregate publication path exists; gate checks evaluate to false whenever GrowthBook is unconfigured or not yet ready, so the experiment cannot be reached by forgetting to configure it.

The stack is a shadow tally — it computes a proposal three ways for comparison and returns `shadowMode: true` — and both of its inputs are frozen (OD-7 §5c), so it has no live data source. Liquid delegation, deliberation and the civic tree are untouched, despite sharing the `qvl` naming: see OD-7 §5e for which tables belong to which feature.

Also corrects the feature-gates README, which documented a `checkGate` method that is private on the client; gate checks go through `scope()`.
