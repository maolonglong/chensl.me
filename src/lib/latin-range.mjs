// Code points that Source Serif sets on the page and on share cards: Latin letters, digits, and
// ASCII punctuation. CJK punctuation, curly quotes, the middle dot, and dashes stay outside, so
// they keep JinKai's full-width forms.
export const latinRanges = [
  [0x20, 0x7e],
  [0xa0, 0xb6],
  [0xb8, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
]

export const latinUnicodeRange = latinRanges.map(([start, end]) =>
  start === end
    ? `U+${start.toString(16).toUpperCase().padStart(4, '0')}`
    : `U+${start.toString(16).toUpperCase().padStart(4, '0')}-${end.toString(16).toUpperCase().padStart(4, '0')}`,
)
