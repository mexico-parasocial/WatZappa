---
'@atproto/oauth-provider-ui': patch
---

Fix type errors in the account pages: name the session state type instead of a self-referential `typeof state`, stop registering the standalone `pages/` router on the global `Register` interface (it collided with the app router), type `LayoutPage` link/base paths as runtime strings since they are composed dynamically and used from more than one router, make `ErrorView`'s `error` prop optional for the not-found page, and replace dead cross-links to `/account/apps` and `/account/about` with account-scoped paths that exist in the app router.
