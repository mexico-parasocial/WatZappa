---
'@atproto/pds': patch
---

With `PDS_SPACES_ENABLED`, each community account owns a member-only space (`com.para.space.community`, key `members`). Its member list is projected from the community's event chain in the transaction that appends each event, so joining admits a member and leaving, removal, blocking or suspension drops them in the same commit. No credentials are issued yet, so nobody but the hosting PDS can read the list.
