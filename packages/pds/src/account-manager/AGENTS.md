# Account database security state

- M8 challenges are issued only from authenticated OAuth/DPoP bindings. Keep nonce and assertion-JTI consumption in one account DB transaction; a receipt conflict must roll back the nonce update.
- Call the durable consumer only after signature and binding verification. Store nonce/JTI hashes, not bearer assertions; retain replay receipts through the shared verifier clock tolerance.
- M8 assurance proves session assurance, not space membership or governance rights. Route wiring must separately enforce the PARA resolver, authenticated issuance rate limits, and periodic bounded cleanup.
