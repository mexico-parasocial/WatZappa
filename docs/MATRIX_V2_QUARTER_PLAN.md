# Matrix v2 — Quarter Plan

**Quarter:** Mon 2026-08-24 → Fri 2026-11-20 (13 weeks, 6 sprints + 1 buffer week)
**Owner:** solo (1 FTE)
**Supersedes:** the resourcing and phasing in `para-matrix-v2-plan.md`. That plan's
findings still hold; its schedule does not — see §1.

---

## 1. Re-baseline: why the original plan cannot run

The v2 plan assumes *"2–3 engineers + sprint lead + part-time security reviewer"*
over 12 weeks — roughly **30 engineer-weeks**. Actual capacity is **one person**
(38 of the last 48 commits; the remainder are upstream atproto contributors, not
team members), sustaining ~7 commits/week. At 1 FTE, 30 engineer-weeks is more
than two quarters.

Three things have also changed since the plan was written:

| Change | Effect on schedule |
|---|---|
| F7 — membership projection cannot survive CD-M1 | Structural. Not in the original plan at all. Adds the OD-6 join-seam problem. |
| CD-M2 — governance/provisioner split | The plan treated "thin provisioner" as a rename. It is a service extraction. |
| F1–F3, F6, F8 fixed; CD-M1 and CD-M3 landed | Phase 1 is ~60% done, ahead of the original schedule. |

**The plan is therefore not "12 weeks, compressed". It is a different plan: one
track, taken to done.**

## 2. The central call: identity this quarter, encryption next

v2 rests on two hard guarantees. **One person cannot land both in 13 weeks.**

| | No server-held identity linkage | E2EE always |
|---|---|---|
| Progress | ~40% (CD-M1, `getMatrixIdentity`, OD-2 memo) | 0% |
| Blocked by | OD-2 — resolvable, see §3 | matrix-js-sdk#4150, unsolved **upstream** |
| Risk | Medium, bounded | High, open-ended, not ours to fix |
| Differentiator | Yes — nobody else does this | No — table stakes, everyone has it |

Attempting both means finishing neither. **Recommendation: the quarter is the
identity boundary.** E2EE gets a 3-day timeboxed spike in S5 — enough to plan
next quarter honestly, not enough to sink this one.

This is the difference between "we removed the linkage table" (a claim nobody
else can make) and "we half-did two things".

### Quarter goal

> A pilot-community member logs into Matrix with an MXID derived from their
> identity key, on staging, with **no table anywhere relating their DID to that
> account** — and the identity-boundary CI suite proves it, both halves.

### Explicit non-goals

Not in this quarter. Each is a deliberate cut, not an oversight:

- **E2EE rollout** — spike only (§2).
- **Tuwunel migration (OD-1)** — Synapse stays. Revisit only if it blocks MAS.
- **Draupnir / Ozone moderation bridge** — v1 moderation keeps running.
- **Federation ACLs beyond "closed"** — closed is already correct.
- **Production cutover and v1 decommission** — staging + rehearsed migration
  only. Cutover is next quarter's first act, from a rehearsed runbook.
- **Full governance extraction (CD-M2)** — only the seam needed to remove the
  linkage table. The monolith survives this quarter.

## 3. The critical path

```
OD-2 decision ─→ identity signature ─→ para-idp ─→ MAS ─→ derived-MXID login
                                                              │
                              OD-6 join seam ─────────────────┤
                                                              ↓
                                                  remove user_matrix_map
                                                              ↓
                                              identity-boundary CI green
```

Everything else in the quarter is off the critical path and is scheduled as
fill or explicitly deferred.

### The single highest-leverage decision in the quarter

OD-2 currently recommends transposing Monero's `generate_signature` to
ristretto255. That is sound, but it **requires cryptographic review that this
project has no one to provide** — the "part-time security reviewer" does not
exist. A hand-rolled scheme with no reviewer is not a schedule risk, it is a
guarantee we cannot honestly make.

`@scure/sr25519` is an audited JS implementation of Schnorr over ristretto255
(Oak Security, Aug 2025), from the same author as `@noble/curves` and
`@scure/bip39` — both already in iM8's dependency tree. It uses merlin
transcripts for domain separation and synthetic nonces, independently matching
both divergences the OD-2 memo argued for.

**S1 opens with a 1-day spike: can we sign with our own identity scalar?**
sr25519 secret keys are `(scalar ‖ nonce)`; if `sign()` accepts a 64-byte key
with our scalar in the first 32 bytes, our `identity_pub_i` *is* the sr25519
public key and OD-2 collapses from "write and audit novel crypto" to "use a
library". If it does not, fall back to the Monero transposition and accept that
the audit becomes a funded external dependency.

**That one day decides whether this quarter is deliverable.**

## 4. Sprints

Each sprint ends with a demo of something a user could do, and a written
decision-log entry. Ceremonies are 30 min plan / 30 min review — solo does not
mean unstructured, it means short.

### S1 · Aug 24 – Sep 04 · Decide and de-risk
- **D1: sr25519 spike** (§3). Outcome recorded as CD-M4 either way.
- Close OD-4 (identity labels — a one-line confirmation) and OD-3 policy half.
- **Verify hardening on live staging** — F1 is only closed when a running server
  refuses `publicRooms`, not when a file exists.
- Implement the identity signature behind `signIdentityChallenge(seed, label,
  payload)`, refusing the ballot identity by the same allowlist as
  `getMatrixIdentity`. Test vectors generated and mirrored into iM8.
- **Exit:** OD-2 closed; signing works in a test; staging hardening verified.

### S2 · Sep 07 – Sep 18 · para-idp
- `para-idp` OIDC shim: verifies the signed payload, issues an ID token with
  `sub` = the CD-M1 localpart. Reuse mubEZ's `issuanceChallenge` for replay
  protection rather than building a second one.
- Challenge single-use + purpose-binding tests.
- **Exit:** `para-idp` issues a valid ID token for a signed identity assertion.

### S3 · Sep 21 – Oct 02 · MAS
- MAS on staging, upstream OIDC = `para-idp`. Synapse delegated auth (MSC3861).
- **Exit (G2):** a real login through MAS produces a derived MXID. No password
  is minted anywhere in the flow.

### S4 · Oct 05 – Oct 16 · Cut the linkage
- **OD-6 join seam** — the hard one. The server can no longer derive a member's
  MXID from their DID, so membership-driven invitation must change. Decide and
  build: client-presents-MXID on join, or invite-by-capability.
- Delete `user_matrix_map`; remove `didToMxid`; retire `/api/matrix-token`
  password issuance.
- Turn on `password_config.enabled: false`.
- **Exit (G3):** the linkage table is gone and the second half of the
  identity-boundary CI suite ("no DID↔MXID table exists") passes.

### S5 · Oct 19 – Oct 30 · Prove it, and look ahead
- Identity-boundary CI complete; F9 authorization checks; F4 content paths.
- **3-day E2EE spike (timeboxed, hard stop):** does matrix-rust-sdk crypto work
  under Hermes, or is a native module required? Output is a go/no-go and an
  estimate for next quarter — not an implementation.
- Retention verified actually purging on staging.
- **Exit (G4):** both CI halves green; E2EE path chosen for next quarter.

### S6 · Nov 02 – Nov 13 · Rehearse
- Migration rehearsal on staging per MATRIX_V2 §5: existing users through the
  new login, old rooms pointed at new ones, v1 tokens destroyed.
- Write the cutover runbook. Threat-model chapter updated with everything
  learned (including the `memwipe` gap and the drand dependency).
- **Exit (G5):** rehearsed migration, runbook written, go/no-go for cutover.

### Buffer · Nov 16 – Nov 20
Unallocated on purpose. Solo projects have no one to absorb overrun. If S1–S6
ran clean, this is where the cutover go/no-go is executed.

## 5. Gates

| Gate | When | Test | If it fails |
|---|---|---|---|
| **G0** | End S1 D1 | sr25519 accepts our scalar | Fall back to Monero transposition; **budget an external audit** or descope to next quarter |
| **G1** | End S1 | Signature works; staging hardening verified | Slip S2; do not start para-idp on an unverified base |
| **G2** | End S3 | Login via MAS yields a derived MXID | Stop. Everything downstream is blocked; re-plan the quarter |
| **G3** | End S4 | `user_matrix_map` deleted, CI green | Ship the quarter as "derived MXIDs live, table removal next" — still a real win |
| **G4** | End S5 | Both CI halves green | Quarter goal missed; state it plainly |
| **G5** | End S6 | Migration rehearsed | Cutover moves to next quarter (it was never promised this one) |

## 6. Risks

| # | Risk | L | I | Mitigation / trigger |
|---|---|---|---|---|
| R1 | sr25519 cannot take our scalar → novel crypto with no reviewer | Med | **High** | G0 on day 1. Trigger: fund an audit or descope. Never ship unreviewed crypto behind a privacy claim. |
| R2 | Solo bus factor | — | **High** | Every decision written as CD-M/OD in-repo. The docs are the redundancy. |
| R3 | OD-6 join seam has no clean answer | Med | High | Timebox to S4; fallback is manual invite for the pilot community only |
| R4 | MAS/MSC3861 integration friction | Med | Med | Keep JWT login behind a flag as temporary fallback (per original plan §8) |
| R5 | Upstream atproto sync work steals capacity | **High** | Med | It already does — the repo carries a large uncommitted upstream diff. Cap sync work at 1 day/sprint or the plan slips. |
| R6 | E2EE spike overruns and eats the quarter | Med | High | Hard 3-day stop. It is a spike, not a project. |
| R7 | Scope creep into ballots | Low | High | Layer-boundary table is merge-blocking |

**R5 is the one to watch.** It is the most likely way this plan fails, and it is
entirely self-inflicted.

## 7. Decisions needed from you

| # | Decision | Needed by | Default if silent |
|---|---|---|---|
| 1 | Accept "identity this quarter, E2EE next" (§2) | Before S1 | Proceed as written |
| 2 | OD-4 — confirm `civic` = ballot identity | S1 | Assume yes (fail-safe direction already taken) |
| 3 | OD-3 policy — LLM processing allowed at all? | S1 | Deploy without `OPENAI_API_KEY` |
| 4 | If G0 fails: fund an audit, or descope? | Contingent | Descope |
| 5 | Cap on upstream-sync time per sprint (R5) | Before S1 | 1 day/sprint |

## 8. What done looks like

At 2026-11-20, a demo that runs end to end on staging:

1. A new member joins the pilot community from the PARA app.
2. They land in a Matrix room as `@<32 base32 chars>:matrix.para.social`.
3. `grep -r` across the bridge database and the homeserver database finds **no
   row relating their DID to that MXID** — because none is written.
4. The CI suite proves the ballot identity has no Matrix account and no table
   exists, and fails the build if either regresses.
5. The migration runbook exists and has been rehearsed once.

Not in that demo: encrypted messages. That is next quarter, and saying so now is
what makes the rest of it true.
