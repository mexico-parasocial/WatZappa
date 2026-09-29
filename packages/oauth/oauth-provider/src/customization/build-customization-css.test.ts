import { describe, expect, it } from 'vitest'
import type { RgbColor } from '../lib/util/color.js'
import { buildCustomizationCss } from './build-customization-css.js'

describe('buildCustomizationCss', () => {
  it('returns undefined when nothing is configured', () => {
    expect(buildCustomizationCss({})).toBeUndefined()
    expect(buildCustomizationCss({ branding: {} })).toBeUndefined()
    expect(buildCustomizationCss({ branding: { name: 'PDS' } })).toBeUndefined()
  })

  describe('background', () => {
    it('emits a per-mode image wrapped in url()', () => {
      const css = buildCustomizationCss({
        branding: {
          background: {
            light: 'https://example.com/light.png',
            dark: 'https://example.com/dark.png',
          },
        },
      })

      expect(css).toContain(
        '--branding-background-light-image: url("https://example.com/light.png");',
      )
      expect(css).toContain(
        '--branding-background-dark-image: url("https://example.com/dark.png");',
      )
    })

    it('escapes quotes and backslashes in the image url', () => {
      const css = buildCustomizationCss({
        branding: {
          background: { light: 'https://example.com/a"b\\c.png' },
        },
      })

      expect(css).toContain(
        '--branding-background-light-image: url("https://example.com/a\\"b\\\\c.png");',
      )
    })

    it('omits modes that are not configured', () => {
      const css = buildCustomizationCss({
        branding: {
          background: { light: 'https://example.com/light.png' },
        },
      })

      expect(css).toContain('--branding-background-light-image:')
      expect(css).not.toContain('--branding-background-dark-image:')
    })

    it('can be configured on its own, without brand colours', () => {
      const css = buildCustomizationCss({
        branding: { background: { light: 'https://example.com/light.png' } },
      })

      expect(css).toMatch(/^:root \{.*\}$/s)
      expect(css).not.toContain('--branding-color-')
    })
  })

  describe('colours (extended palette)', () => {
    const primary: RgbColor = { r: 131, g: 56, b: 236 }

    it('emits base, contrast and hue per colour', () => {
      const css = buildCustomizationCss({
        branding: { colors: { primary } },
      })

      expect(css).toContain('--branding-color-primary: 131 56 236;')
      expect(css).toMatch(/--branding-color-primary-contrast: \d+ \d+ \d+;/)
      expect(css).toMatch(/--branding-color-primary-hue: [\d.]+;/)
    })

    it('honours explicit contrast and hue overrides', () => {
      const css = buildCustomizationCss({
        branding: {
          colors: {
            primary,
            primaryContrast: { r: 0, g: 0, b: 0 },
            primaryHue: 210,
          },
        },
      })

      expect(css).toContain('--branding-color-primary-contrast: 0 0 0;')
      expect(css).toContain('--branding-color-primary-hue: 210;')
    })

    it('derives hue from the colour itself when not overridden', () => {
      const css = buildCustomizationCss({
        branding: { colors: { primary: { r: 0, g: 255, b: 0 } } },
      })

      expect(css).toContain('--branding-color-primary-hue: 120;')
    })

    it('picks the contrast from the light/dark bases when provided', () => {
      const css = buildCustomizationCss({
        branding: {
          colors: {
            primary: { r: 128, g: 128, b: 128 },
            light: { r: 0, g: 0, b: 0 },
            dark: { r: 255, g: 255, b: 255 },
          },
        },
      })

      // Mid grey has a higher WCAG contrast against the light base than
      // against the dark base.
      expect(css).toContain('--branding-color-primary-contrast: 0 0 0;')
    })

    it('reflects the configured contrast saturation', () => {
      const css = buildCustomizationCss({
        branding: { colors: { primary, contrastSaturation: 45 } },
      })

      expect(css).toContain('--contrast-sat: 45.00%;')
    })

    it('defaults the contrast saturation to 30', () => {
      const css = buildCustomizationCss({
        branding: { colors: { primary } },
      })

      expect(css).toContain('--contrast-sat: 30.00%;')
    })
  })
})
