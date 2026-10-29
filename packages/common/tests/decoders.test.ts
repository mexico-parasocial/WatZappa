import { randomBytes } from 'node:crypto'
import { type Duplex, Readable, pipeline } from 'node:stream'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import * as streams from '../src/streams.js'

describe(streams.createDecoders, () => {
  const decode = (
    input: Uint8Array,
    contentEncoding: string | string[] | undefined,
    options?: streams.CreateDecodersOptions,
  ): Promise<Buffer> =>
    streams.streamToNodeBuffer(
      pipeline(
        [
          Readable.from([input]),
          ...streams.createDecoders(contentEncoding, options),
        ],
        () => {},
      ) as Duplex,
    )

  it('decodes codings in reverse order of application', async () => {
    const payload = Buffer.from('hello world')
    const encoded = brotliCompressSync(gzipSync(payload))

    await expect(decode(encoded, 'gzip, br')).resolves.toEqual(payload)
    await expect(decode(encoded, ['gzip', 'br'])).resolves.toEqual(payload)
  })

  it('rejects too many codings before constructing any decoder', () => {
    const tooMany = Array(streams.DEFAULT_MAX_CODINGS + 1).fill('gzip')

    expect(() => streams.createDecoders(tooMany.join(','))).toThrow(
      /exceed the maximum of 8/,
    )
    // An unsupported coding past the cap must not be reached
    expect(() =>
      streams.createDecoders([...tooMany, 'unsupported'].join(',')),
    ).toThrow(/exceed the maximum/)
    expect(() =>
      streams.createDecoders('gzip, gzip, gzip', { maxCodings: 2 }),
    ).toThrow(/3 codings \(gzip, gzip, gzip\) exceed the maximum of 2/)
    expect(
      streams.createDecoders('gzip, gzip', { maxCodings: 2 }),
    ).toHaveLength(2)
  })

  it('ignores empty and identity codings', () => {
    const identities = Array(20).fill('identity').join(',')

    expect(streams.createDecoders(undefined)).toEqual([])
    expect(streams.createDecoders('')).toEqual([])
    expect(streams.createDecoders([])).toEqual([])
    expect(streams.createDecoders(identities)).toEqual([])
    expect(streams.createDecoders(identities, { maxSize: 1 })).toEqual([
      expect.any(streams.MaxSizeChecker),
    ])
  })

  it('bounds identity-encoded bodies with a MaxSizeError by default', async () => {
    await expect(
      decode(Buffer.alloc(4), undefined, { maxSize: 4 }),
    ).resolves.toHaveLength(4)

    const err = await decode(Buffer.alloc(5), undefined, {
      maxSize: 4,
    }).catch((err) => err)
    expect(err).toBeInstanceOf(streams.MaxSizeError)
    expect(err.maxSize).toBe(4)
  })

  it('bounds the decoded output of a single coding', async () => {
    const maxSize = 1024
    const maxSizeError = () => new Error('too large')

    expect(
      streams.createDecoders('gzip', { maxSize, maxSizeError }),
    ).toHaveLength(2)

    await expect(
      decode(gzipSync(Buffer.alloc(maxSize)), 'gzip', {
        maxSize,
        maxSizeError,
      }),
    ).resolves.toHaveLength(maxSize)
    await expect(
      decode(gzipSync(Buffer.alloc(maxSize + 1)), 'gzip', {
        maxSize,
        maxSizeError,
      }),
    ).rejects.toThrow('too large')
  })

  it('bounds the intermediate output of chained codings', async () => {
    const maxSize = 1024
    const maxSizeError = () => new Error('too large')

    // Empty gzip members decode to nothing, so the final output stays empty
    // while the intermediate stage grows past the budget.
    const emptyMember = gzipSync(Buffer.alloc(0))
    const intermediate = Buffer.concat(
      Array(Math.ceil((2 * maxSize) / emptyMember.length)).fill(emptyMember),
    )
    const encoded = gzipSync(intermediate)

    // Only the budget limiter can catch this: the final output is empty.
    await expect(decode(encoded, 'gzip, gzip')).resolves.toHaveLength(0)
    await expect(
      decode(encoded, 'gzip, gzip', { maxSize, maxSizeError }),
    ).rejects.toThrow('too large')
  })

  it('requires each extra coding in a chain to shrink its input', async () => {
    const maxSize = 64 * 1024
    const options = { maxSize, maxSizeError: () => new Error('too large') }

    // Compressible payload: the intermediate stage is tiny.
    await expect(
      decode(gzipSync(gzipSync(Buffer.alloc(maxSize))), 'gzip, gzip', options),
    ).resolves.toHaveLength(maxSize)

    // Incompressible payload: intermediate + final output must fit within
    // maxSize * (1 + 0.95), so the final output is capped below maxSize.
    const fits = randomBytes(Math.floor(maxSize * 0.9))
    await expect(
      decode(gzipSync(gzipSync(fits)), 'gzip, gzip', options),
    ).resolves.toEqual(fits)

    const exceeds = randomBytes(maxSize)
    await expect(
      decode(gzipSync(gzipSync(exceeds)), 'gzip, gzip', options),
    ).rejects.toThrow('too large')
  })
})
