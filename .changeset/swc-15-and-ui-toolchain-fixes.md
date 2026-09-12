---
'@atproto/api': patch
'@atproto/pds': patch
'@atproto/oauth-provider-ui': patch
---

Fix the dependency-refresh fallout: pin @swc/core to ~1.15.11 so the
@lingui/swc-plugin wasm ABI matches, pin vite to the 6.x line in the UI
packages (vite 8/rolldown cannot load swc wasm plugins), declare the
missing @vitejs/plugin-react-swc and @lingui/swc-plugin dependencies,
narrow the setAuthFactor authFactorType cast, and pin the interestsPref
$type in AtpAgent.setInterestsPref.
