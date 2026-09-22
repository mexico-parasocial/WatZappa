---
'@atproto/common': minor
'@atproto/pds': patch
'@atproto/bsky': patch
'@atproto/api': patch
'@atproto/dev-env': patch
---

Put every PARA ballot-shaped record in one of three boxes (OD-7 §5h). Freeze `com.para.raq.proposalAnswer`, whose `value` is a -3..+3 position, and the abandoned `com.para.community.civicTreeVote`, at both PDS write and AppView indexing. Treat `com.para.civic.openQuestionVote`, `com.para.raq.proposalVote` and `com.para.raq.axisVote` as public reactions. Their counts decide nothing, so the PDS now refuses one that carries `voteNullifier` or `eligibilityProofRef`: asking m8 for a proof makes it store which subject a person reacted to, for no integrity gain. The refusal applies on write only, so historical reactions still index. Also names RAQ correctly, as Rightfully Asked Questions.
