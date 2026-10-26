import { fontProviders } from 'astro/config'

export async function siteFonts() {
  return [
    {
      provider: fontProviders.local(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains',
      display: 'swap',
      fallbacks: [],
      optimizedFallbacks: false,
      options: {
        variants: [
          ['Regular', 400, 'normal'],
          ['Bold', 700, 'normal'],
          ['Italic', 400, 'italic'],
          ['BoldItalic', 700, 'italic'],
        ].map(([name, weight, style]) => ({
          src: [`./src/assets/fonts/jetbrains-mono-2.304/JetBrainsMono-${name}.woff2`],
          weight,
          style,
        })),
      },
    },
  ]
}
