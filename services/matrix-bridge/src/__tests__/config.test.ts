import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'

describe(loadConfig, () => {
  beforeEach(() => {
    process.env.MATRIX_ADMIN_TOKEN = 'test-token'
  })

  afterEach(() => {
    delete process.env.MATRIX_ENABLE_ENCRYPTION
    delete process.env.MATRIX_ADMIN_TOKEN
  })

  it('defaults MATRIX_ENABLE_ENCRYPTION to false', () => {
    delete process.env.MATRIX_ENABLE_ENCRYPTION
    const config = loadConfig()
    expect(config.matrixEnableEncryption).toBe(false)
  })

  it('parses MATRIX_ENABLE_ENCRYPTION=true', () => {
    process.env.MATRIX_ENABLE_ENCRYPTION = 'true'
    const config = loadConfig()
    expect(config.matrixEnableEncryption).toBe(true)
  })
})
