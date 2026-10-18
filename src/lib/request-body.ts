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

// Drains the body so local Wrangler can reuse the connection, without keeping it in memory.
export async function drainBody(request: Request) {
  await readBoundedBytes(request, 0)
}
