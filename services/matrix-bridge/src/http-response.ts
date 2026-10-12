/** Fetch exposes decoded bytes, so bound the body after HTTP decompression. */
export async function readBoundedJson<T>(
  response: Response,
  maxBytes: number,
): Promise<T> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty HTTP response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('HTTP response too large')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
