import { MAX_RECORD_SIZE } from '@atproto/space'
import { prepareCreate } from '../src/repo/prepare.js'

describe('space record size boundary', () => {
  it('refuses a record that a STAR consumer cannot accept', async () => {
    await expect(
      prepareCreate({
        did: 'did:web:owner.example',
        space: 'at://did:web:owner.example/space/com.para.space.personal/notes',
        collection: 'com.example.note',
        rkey: 'large',
        record: { text: 'x'.repeat(MAX_RECORD_SIZE) },
      }),
    ).rejects.toThrow('Record too large')
  })
})
