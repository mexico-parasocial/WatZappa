import { encode } from '@atproto/lex-cbor'
import { type LexValue, cidForCbor } from '@atproto/lex-data'
import {
  type CarBlock,
  readCarBytes,
  readCarStream,
  writeCarStream,
} from '../src/index.js'

const dataToBlock = async (data: LexValue): Promise<CarBlock> => {
  const bytes = encode(data)
  const cid = await cidForCbor(bytes)
  return { cid, bytes }
}

const collect = async (stream: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const collectBlocks = async (
  blocks: AsyncIterable<CarBlock>,
): Promise<CarBlock[]> => {
  const result: CarBlock[] = []
  for await (const block of blocks) result.push(block)
  return result
}

async function* fragmented(
  bytes: Uint8Array,
  sizes: readonly number[],
): AsyncIterable<Uint8Array> {
  let offset = 0
  let index = 0
  while (offset < bytes.byteLength) {
    const size = sizes[index++ % sizes.length]!
    yield bytes.subarray(offset, offset + size)
    offset += size
  }
}

describe('car', () => {
  it('round-trips ordered roots and blocks from fragmented streams', async () => {
    const first = await dataToBlock({ root: 'first' })
    const second = await dataToBlock({ root: 'second' })
    const car = await collect(
      writeCarStream([first.cid, second.cid], [first, second]),
    )

    const { roots, blocks } = await readCarStream(fragmented(car, [1, 7, 3]))
    expect(roots.map(String)).toEqual([String(first.cid), String(second.cid)])
    expect(
      (await collectBlocks(blocks)).map((block) => String(block.cid)),
    ).toEqual([String(first.cid), String(second.cid)])
  })

  it('supports empty roots and byte-backed readers', async () => {
    const block = await dataToBlock({ record: 1 })
    const car = await collect(writeCarStream(null, [block]))

    const { roots, blocks } = await readCarBytes(car)
    expect(roots).toEqual([])
    expect(await collectBlocks(blocks)).toEqual([block])
  })

  it('rejects invalid CID-to-content mappings unless explicitly skipped', async () => {
    const valid = await dataToBlock({ record: 'valid' })
    const other = await dataToBlock({ record: 'other' })
    const car = await collect(
      writeCarStream(valid.cid, [{ cid: valid.cid, bytes: other.bytes }]),
    )

    const verified = await readCarBytes(car)
    await expect(collectBlocks(verified.blocks)).rejects.toThrow(
      'Not a valid CID for bytes',
    )

    const skipped = await readCarBytes(car, { skipCidVerification: true })
    const blocks = await collectBlocks(skipped.blocks)
    expect(blocks).toEqual([{ cid: valid.cid, bytes: other.bytes }])
  })

  it('closes an unconsumed input stream when blocks are dumped', async () => {
    const block = await dataToBlock({ record: 'pending' })
    const car = await collect(writeCarStream(block.cid, [block]))
    let closed = false
    async function* input() {
      try {
        yield car
      } finally {
        closed = true
      }
    }

    const { blocks } = await readCarStream(input())
    await blocks.dump()
    expect(closed).toBe(true)
  })
})
