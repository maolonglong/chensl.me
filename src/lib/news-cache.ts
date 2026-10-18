import { cache } from 'cloudflare:workers'
import { issueCacheTags } from './news'

// News responses carry their loader's cache tags (src/lib/news-pages.ts). After a write or
// retraction the API purges the issue's tags, which include `news`, so every list page and the
// feed refresh too. Workers Cache always applies the Free plan purge limits, five requests a
// minute, and the bot writes about once a day. A failed purge leaves pages stale for up to their
// s-maxage; the reply reports it so the bot can resend. Local Wrangler has no Workers Cache to
// purge, which the reply reports as unavailable.
export type PurgeResult = 'purged' | 'failed' | 'unavailable'

export async function purgeIssue(date: string): Promise<PurgeResult> {
  try {
    if (typeof cache?.purge !== 'function') return 'unavailable'
    const result = await cache.purge({ tags: issueCacheTags(date) })
    if (result.success) return 'purged'
    console.error('news cache purge failed', date, result.errors)
  } catch (error) {
    console.error('news cache purge failed', date, error)
  }
  return 'failed'
}
