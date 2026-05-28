# Matrix↔PARA Bridge — End-to-End Test Checklist

> **Environment:** Local Docker Compose or staging bare metal  
> **Prerequisites:** Synapse + Bridge + PDS running, admin token configured

---

## 1. Bridge Health & Metrics

| #   | Test             | Command / Step                                                                   | Expected Result                          | ✅  |
| --- | ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------- | --- |
| 1.1 | Health endpoint  | `curl http://localhost:3001/healthz`                                             | `{"status":"ok","failedSyncs":0}`        | ☐   |
| 1.2 | Metrics endpoint | `curl http://localhost:3001/metrics`                                             | Prometheus metrics with `para_matrix_*`  | ☐   |
| 1.3 | Space lookup auth | `curl "http://localhost:3001/api/space-for-community?uri=at://..."` without M8 token | 401 Unauthorized                         | ☐   |
| 1.4 | Space lookup      | Same request with `Authorization: Bearer <m8-token>` for an active member          | `{"spaceId":"!xxx","slug":"..."}`         | ☐   |
| 1.5 | Token generation  | `curl -X POST -H "Authorization: Bearer <m8-token>" http://localhost:3001/api/matrix-token` | `{"accessToken":"...","userId":"..."}`    | ☐   |

---

## 2. Firehose → Matrix Sync

| #   | Test               | Step                                      | Expected Result                            | ✅  |
| --- | ------------------ | ----------------------------------------- | ------------------------------------------ | --- |
| 2.1 | Community creation | Create `com.para.community.board` record  | Matrix space created, logged in `sync_log` | ☐   |
| 2.1a | E2EE state       | Inspect new room state                    | `m.room.encryption` uses `m.megolm.v1.aes-sha2` | ☐   |
| 2.2 | Creator admin      | Check power level of creator in new space | PL = 100                                   | ☐   |
| 2.3 | Member invite      | Join community → membership `active`      | User invited to space, PL = 0              | ☐   |
| 2.4 | Moderator PL       | Update membership with `moderator` role   | PL = 50                                    | ☐   |
| 2.5 | Owner PL           | Update membership with `owner` role       | PL = 100                                   | ☐   |
| 2.6 | Member kick        | Leave community or set `removed`          | User kicked from space                     | ☐   |
| 2.7 | Block kick         | Set membership `blocked`                  | User kicked from space                     | ☐   |
| 2.8 | Idempotency        | Re-process same firehose event            | No duplicate invite / No error             | ☐   |
| 2.9 | Cursor resume      | Stop bridge, create community, restart    | Bridge resumes and processes missed event  | ☐   |

---

## 3. PARA App → Matrix Integration

| #   | Test                | Step                                    | Expected Result                             | ✅  |
| --- | ------------------- | --------------------------------------- | ------------------------------------------- | --- |
| 3.1 | Chat button visible | Open community profile as active member | 💬 Chat pill visible                        | ☐   |
| 3.2 | Chat button hidden  | Open community profile as non-member    | No Chat pill                                | ☐   |
| 3.3 | WebView opens       | Tap Chat button                         | Element Web loads in WebView                | ☐   |
| 3.4 | Auto-authentication | First time opening chat                 | User is already logged in (no login screen) | ☐   |
| 3.5 | Room loaded         | After auto-auth                         | Specific community room is displayed        | ☐   |
| 3.6 | Send message        | Type and send in chat                   | Message appears in room                     | ☐   |
| 3.7 | Receive message     | Send from another client                | Message appears in app WebView              | ☐   |
| 3.8 | Back navigation     | Tap back from chat                      | Returns to community profile                | ☐   |
| 3.9 | Unread badge        | Receive message while not in chat       | Red badge appears on Chat pill              | ☐   |

---

## 4. Retry & Resilience

| #   | Test         | Step                                    | Expected Result                             | ✅  |
| --- | ------------ | --------------------------------------- | ------------------------------------------- | --- |
| 4.1 | Synapse down | Stop Synapse, trigger membership change | Event logged in `sync_log` with `success=0` | ☐   |
| 4.2 | Auto-retry   | Wait 60s, restart Synapse               | Failed event retried and succeeds           | ☐   |
| 4.3 | Max retries  | Keep Synapse down for >5 retry cycles   | Event stays failed, no infinite loop        | ☐   |
| 4.4 | Backpressure | Create 50 communities rapidly           | All processed without loss                  | ☐   |

---

## 5. Security

| #   | Test                | Step                                                            | Expected Result                 | ✅  |
| --- | ------------------- | --------------------------------------------------------------- | ------------------------------- | --- |
| 5.1 | Federation disabled | `curl https://matrix.para.social/_matrix/federation/v1/version` | Connection refused or 404       | ☐   |
| 5.2 | Closed registration | Try to register via Element                                     | Registration disabled           | ☐   |
| 5.3 | Public rooms hidden | Query public room directory                                     | Empty or auth required          | ☐   |
| 5.4 | Admin API protected | Call admin endpoint without token                               | 401 Unauthorized                | ☐   |
| 5.5 | Token scoped        | Use generated user token                                        | Can only access user's own data | ☐   |
| 5.6 | No raw bridge content | Inspect `matrix_events.content` after messages                | NULL for ingested events        | ☐   |
| 5.7 | Generic push payload | Send encrypted Matrix message                                  | Push has no message preview     | ☐   |
| 5.8 | M8 key backup opaque | Read M8 `chat_key_backups` table                               | Contains ciphertext only        | ☐   |

---

## Notes

- Run tests in order — some tests depend on previous state
- For 2.x tests, use the PDS test account or local atproto firehose
- For 3.x tests, use a physical device or iOS/Android simulator
- Document any failures with logs: `docker logs para-matrix-bridge > failure.log`

---

_Tested by: **\*\*\*\***\_**\*\*\*\***_  
_Date: **\*\*\*\***\_**\*\*\*\***_  
_Environment: **\*\*\*\***\_**\*\*\*\***_
