# PARA Consensus Model

## Release Principle

Community governance should be verifiable through signed records before it is automated by more advanced infrastructure. Discourse analysis is not part of this release path.

PARA consensus starts with three ideas:

- badges are capability-bearing civic credentials
- votes are signed signals tied to a specific record version
- official policy status comes from quorum, threshold, and certification

## Default Community Badges

| Badge            | Rights                                                                        | Responsibilities                                         |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Member           | Read, comment, follow proposals, cast non-official signals where allowed      | Follow community rules and participate honestly          |
| Verified Member  | Create proposals, cast quorum-counting policy votes, nominate/apply for roles | Maintain eligibility and avoid duplicate participation   |
| Deputy Applicant | Request a deputy role and gather support                                      | Disclose intent and accept review                        |
| Deputy           | Sponsor proposals, convene discussion, elevate community matters              | Represent members and explain decisions                  |
| Delegate         | Open vote windows, certify results with another authorized actor              | Steward procedure and avoid unilateral certification     |
| Moderator        | Enforce safety and community rules                                            | Keep moderation separate from vote alteration            |
| Public Official  | Issue accountable official responses                                          | Speak under verified identity and preserve public record |

## Weighted Policy Vote

Policy votes use `com.para.civic.vote` with a `signal` from `-3` to `+3`.

| Signal | Meaning            |
| ------ | ------------------ |
| `-3`   | Strong opposition  |
| `-2`   | Opposition         |
| `-1`   | Lean opposition    |
| `0`    | Neutral or abstain |
| `1`    | Lean support       |
| `2`    | Support            |
| `3`    | Strong support     |

The record target is `subject`, an AT URI for the proposal, policy, matter, or governance record being evaluated. Existing cabildeo option votes can continue to use `selectedOption`.

## Official Policy Flow

1. A verified member, deputy, delegate, or public official creates a policy proposal.
2. A deputy or delegate sponsors the proposal into a vote window.
3. The proposal version is frozen for voting.
4. Eligible members publish signed `com.para.civic.vote` records with `signal`.
5. The system computes quorum and weighted consensus.
6. Delegates certify that the rule was followed.
7. If quorum and threshold pass, the community publishes an official policy record.

## MVP Consensus Rule

The first production rule should stay simple:

- eligible voters: verified members, deputies, delegates, and public officials
- quorum: at least 10 eligible voters or 20 percent of eligible voters, whichever is lower for the first community
- passage: average signal greater than or equal to `1`
- strong passage: average signal greater than or equal to `2`
- rejection: average signal less than or equal to `-1`
- certification: two delegates, or one delegate and one moderator/auditor

This gives PARA a usable policy consensus mechanism without requiring discourse analysis, TEEs, or zero-knowledge proofs in the first release.

## Future Attestation Path

The same record shape can later support a TEE-backed consensus signer. The TEE would verify the proposal version, eligibility snapshot, vote records, quorum rule, and threshold, then sign the final tally. Clients could then verify the consensus result by checking signatures instead of trusting a private server-side tally.
