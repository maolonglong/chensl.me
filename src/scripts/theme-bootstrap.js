;(() => {
  'use strict'
  const root = document.documentElement
  try {
    const mode = localStorage.getItem('color-theme')
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode
  } catch {}
  const theme =
    root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.querySelectorAll('meta[data-theme-color]').forEach((element) => {
    element.media = element.dataset.themeColor === theme ? 'all' : 'not all'
  })
})()
