import rss from '@astrojs/rss'
import { render } from 'astro:content'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import type { APIContext } from 'astro'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { publishedPosts, postUrl } from '../lib/posts'

const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeStringify)

export async function GET(context: APIContext) {
  const posts = (await publishedPosts()).slice(0, 20)
  const container = await AstroContainer.create()
  return rss({
    title: '~chensl',
    description: '陈劭珑的个人网站与技术博客',
    site: context.site!,
    customData: '<language>zh-CN</language>',
    items: await Promise.all(
      posts.map(async (post) => {
        const { Content } = await render(post)
        const html = await container.renderToString(Content)
        const url = new URL(postUrl(post), context.site)
        // Render through Astro so optimized local image URLs also work in feed readers.
        // Parse HTML before resolving URLs: attributes may contain named or numeric entities.
        const tree = processor.parse(html)
        visit(tree, 'element', (node) => {
          for (const attribute of ['href', 'src']) {
            const value = node.properties[attribute]
            if (typeof value === 'string' && !/^[a-z][a-z\d+.-]*:/i.test(value)) {
              node.properties[attribute] = new URL(value, url).href
            }
          }
        })
        const content = processor.stringify(tree)
        return {
          title: post.data.title,
          description: post.data.description,
          pubDate: post.data.pubDate,
          link: url.href,
          author: 'shaolong.chen@outlook.it (Shaolong Chen)',
          content,
        }
      }),
    ),
  })
}
