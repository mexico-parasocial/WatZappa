---
'@atproto/api': patch
---

The `voteNullifier` and `eligibilityProofRef` descriptions on the three reaction lexicons (`com.para.civic.openQuestionVote`, `com.para.raq.proposalVote`, `com.para.raq.axisVote`) now mark both fields DEPRECATED and refused on write. These collections are public reactions (OD-7 §5h): their counts decide nothing, `reactionWriteRefusal` refuses any write carrying the fields, and the descriptions no longer explain how to obtain what the PDS will not accept. PARA's vendored copies are corrected with them; the `indigo-main` set there had drifted further and still carried the pre-§5a "privacy-preserving" wording.
