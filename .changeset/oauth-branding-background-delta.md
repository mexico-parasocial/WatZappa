---
'@atproto/oauth-provider': minor
'@atproto/oauth-provider-ui': patch
'@atproto/pds': minor
---

Port the branding background-image support from the upstream oauth-provider-ui redesign (#5482) and rename `BrandingInput`/`CustomizationInput` to `BrandingConfig`/`CustomizationConfig` to match upstream. The extended color palette (light/dark bases, `contrastSaturation`, per-color `${name}Contrast`/`${name}Hue`) is preserved on top of the upstream schema, and the PDS regains the `PDS_BACKGROUND_LIGHT_URL`/`PDS_BACKGROUND_DARK_URL` env vars alongside the extended `PDS_*_COLOR[_CONTRAST][_HUE]` ones.
