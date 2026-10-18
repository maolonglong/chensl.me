const maxDrainBytes = 1024 * 1024

// Reads at most maxBytes. A body over maxDrainBytes is cancelled instead of buffered, and any
// body over maxBytes returns null.
export async function readBoundedBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total <= maxBytes) {
      chunks.push(value)
    } else if (total > maxDrainBytes) {
      await reader.cancel()
      return null
    }
  }
  if (total > maxBytes) return null
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

// Reads the body to its end and keeps none of it, so memory stays at one chunk. It never cancels:
// a cancelled body leaves bytes unread, and local Wrangler then loses the next request on the
// connection (e2e/upvotes.spec.mjs).
export async function drainBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return
  while (true) {
    const { done } = await reader.read()
    if (done) return
  }
}
