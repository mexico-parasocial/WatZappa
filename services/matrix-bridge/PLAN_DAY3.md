# Plan: Day 3 — PARA App Frontend Integration

> **Scope:** Mobile app changes to let PARA users access their community's Matrix space.
> **Constraint:** No deployment automation yet — that comes later with Spanish guides for client + admin.
> **Estimated effort:** 1 day

---

## Objective

Every PARA community screen gets a **"Chat"** button. Tapping it opens the community's Matrix space inside the PARA app (embedded Element Web via WebView) or in the user's native Matrix client if installed.

Users never need to know they're using Matrix. They just see "Chat" and it works.

---

## Architecture

```
┌─────────────────┐      tap "Chat"      ┌─────────────────┐
│  PARA Community │ ───────────────────> │  CommunityChat  │
│  Profile Screen │                      │  Screen         │
└─────────────────┘                      └─────────────────┘
                                                │
                                                │ WebView
                                                ▼
┌──────────────────────────────────────────────────────────┐
│  Element Web @ https://chat.para.social                  │
│  ?loginToken=...  OR  direct SSO                         │
│  → loads the specific community space                    │
└──────────────────────────────────────────────────────────┘
```

**Two possible approaches:**

### Option A: Embedded Element Web (Recommended)

- Full React Native `WebView` loads `https://chat.para.social/#/room/{spaceId}`
- Pros: Users stay in PARA app, consistent branding, no external app needed
- Cons: WebView limitations (push notifications, file uploads slightly degraded)

### Option B: Deep-link to native Matrix client

- Try `element://room/{spaceId}` → falls back to WebView
- Pros: Best UX if user has Element installed
- Cons: Most users won't have Element; external context switch

**Decision:** Implement **Option A** (embedded WebView) with an overflow menu item to "Open in Element app" as a secondary action.

---

## Files to Create / Modify

### New Files

| File                                                   | Purpose                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `PARA/src/screens/Communities/CommunityChatScreen.tsx` | WebView wrapper for Element Web with URL construction                          |
| `PARA/src/state/queries/matrix.ts`                     | React Query hook to fetch `spaceId` for a community URI from bridge or AppView |

### Modified Files

| File                                                            | Change                                             |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `PARA/src/lib/routes/types.ts`                                  | Add `CommunityChat: {communityUri: string}` route  |
| `PARA/src/Navigation.tsx`                                       | Register `CommunityChat` screen in stack navigator |
| `PARA/src/screens/Communities/CommunityProfileScreen/index.tsx` | Add "Chat" FAB or header button                    |

---

## Implementation Details

### 1. Route Definition (`routes/types.ts`)

```ts
export type CommunitiesTabNavigatorParams = {
  // ... existing routes
  CommunityChat: { communityUri: string }
}
```

### 2. Navigation Registration (`Navigation.tsx`)

```tsx
<Stack.Screen
  name="CommunityChat"
  component={CommunityChatScreen}
  options={{ title: 'Chat' }}
/>
```

### 3. React Query Hook (`state/queries/matrix.ts`)

**Problem:** The PARA app doesn't know the `spaceId` for a community. It only knows `communityUri` (`at://did:plc:.../com.para.community.board/...`).

**Solution:** Two options:

- **A)** Query the bridge's mapping DB via a new XRPC endpoint: `com.para.matrix.getSpaceForCommunity`
- **B)** Store `spaceId` in the AppView's community record (denormalized)

**Decision:** Option A — add a lightweight XRPC endpoint to the bridge (or AppView) that looks up `spaceId` by `communityUri`.

```ts
// state/queries/matrix.ts
export function useCommunitySpaceQuery(communityUri: string) {
  return useQuery({
    queryKey: ['matrix-space', communityUri],
    queryFn: async () => {
      const res = await agent.com.para.matrix.getSpaceForCommunity({
        communityUri,
      })
      return res.data.spaceId // e.g. "!abcdef:matrix.para.social"
    },
    enabled: !!communityUri,
  })
}
```

**New XRPC lexicon needed:** `com.para.matrix.getSpaceForCommunity`

```json
{
  "lexicon": 1,
  "id": "com.para.matrix.getSpaceForCommunity",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": ["communityUri"],
        "properties": {
          "communityUri": { "type": "string", "format": "at-uri" }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["spaceId"],
          "properties": {
            "spaceId": { "type": "string" },
            "slug": { "type": "string" }
          }
        }
      }
    }
  }
}
```

### 4. Community Chat Screen (`screens/Communities/CommunityChatScreen.tsx`)

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useCommunitySpaceQuery } from '#/state/queries/matrix'

const ELEMENT_URL = 'https://chat.para.social'

export function CommunityChatScreen({
  route,
}: {
  route: { params: { communityUri: string } }
}) {
  const { communityUri } = route.params
  const { data, isLoading } = useCommunitySpaceQuery(communityUri)

  if (isLoading || !data) {
    return <LoadingPlaceholder />
  }

  // Element Web deep-link to a specific room
  const url = `${ELEMENT_URL}/#/room/${encodeURIComponent(data.spaceId)}`

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        // Optional: inject CSS to hide Element's left sidebar, show only the room
        injectedJavaScript={HIDE_SIDEBAR_JS}
      />
    </View>
  )
}

// Hide Element's room list, user menu, etc. to make it feel "in-app"
const HIDE_SIDEBAR_JS = `
  (function() {
    const style = document.createElement('style');
    style.innerHTML = '
      .mx_LeftPanel { display: none !important; }
      .mx_RoomHeader { padding-left: 16px !important; }
    ';
    document.head.appendChild(style);
  })();
`
```

### 5. Community Profile Screen — "Chat" Button

In `CommunityProfileScreen/index.tsx`, add a floating action button (FAB) or a button in the header:

```tsx
<Button
  label="Chat"
  icon="chat"
  onPress={() => navigation.navigate('CommunityChat', { communityUri })}
/>
```

Show a **lock icon** or disabled state if the user is not an active member of the community.

---

## Authentication Flow

**Problem:** When Element Web loads in the WebView, the user is not logged in. They see a login screen.

**Solutions (pick one):**

### Option A: `loginToken` (MSC3861) — Best UX

1. Bridge generates a short-lived `loginToken` via Synapse Admin API
2. AppView XRPC endpoint: `com.para.matrix.getLoginToken` returns `?loginToken=...`
3. Element Web URL: `https://chat.para.social/?loginToken=xxx#/room/...`
4. Synapse auto-logs the user in, redirects to the room

**Requires:** Synapse `sso_client_whitelist` or `login_via_existing_session` enabled.

### Option B: Auto-fill credentials via injected JS

1. Bridge stores user's Matrix password in SQLite
2. App fetches password via secure XRPC endpoint
3. Injected JavaScript fills the login form and submits it

**Risk:** Password exposure in WebView context. Not recommended.

### Option C: Shared session cookie (Recommended for Day 3)

1. Element Web is served from the same domain as PARA (`chat.para.social`)
2. Bridge sets a secure HTTP-only cookie with a session token
3. WebView inherits the cookie, Element Web recognizes the session

**Simplest implementation for Day 3:** Use Option A if Synapse supports it, else fall back to Option C with a simple token-based auto-login mechanism.

**Day 3 pragmatic choice:** Start with **no auto-auth**. User sees Element login screen once, then session persists in WebView cookies. Add auto-auth in Day 4 polish.

---

## Decisions & Trade-offs

| Decision               | Choice                 | Rationale                                                                                           |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| WebView vs. native SDK | WebView                | Faster to ship, no additional native deps. Can migrate to `matrix-bot-sdk` RN wrapper later.        |
| Auto-auth now?         | No                     | Session persistence via cookies is good enough for Day 3. Auto-auth adds Synapse config complexity. |
| `spaceId` lookup       | XRPC endpoint          | Keeps mapping in one place (bridge DB). AppView doesn't need to know about Matrix.                  |
| Hide Element UI?       | Yes, via CSS injection | Makes it feel like a native PARA feature, not an external site.                                     |

---

## Testing Checklist

- [ ] "Chat" button visible only for active community members
- [ ] Tapping opens WebView with correct room
- [ ] Element Web loads, user can send/receive messages
- [ ] Back button returns to community profile
- [ ] Session persists across app restarts (cookie-based)
- [ ] Offline state shows sensible error

---

## Open Questions

1. **Does PARA already use `react-native-webview`?** If not, we need to add it + Pod install.
2. **iOS ATS:** `chat.para.social` must use HTTPS or have ATS exception.
3. **Push notifications:** WebView Element won't trigger native push. Acceptable for Day 3?

---

## Files Summary

```
NEW:
  PARA/src/screens/Communities/CommunityChatScreen.tsx
  PARA/src/state/queries/matrix.ts
  WhatZatppa/lexicons/com/para/matrix/getSpaceForCommunity.json

MODIFIED:
  PARA/src/lib/routes/types.ts
  PARA/src/Navigation.tsx
  PARA/src/screens/Communities/CommunityProfileScreen/index.tsx
  WhatZatppa/packages/bsky/src/api/index.ts  (register new XRPC handler)
  WhatZatppa/packages/bsky/src/api/com/para/matrix/getSpaceForCommunity.ts
```

---

_Plan created: 2026-05-05_
_Status: Awaiting approval_
