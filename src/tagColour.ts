/*
 * A tag mark's text colour (#310): black or white, whichever contrasts more with the tag's own colour. Shared by the
 * site's Table of Contents and the publisher's page, so the two show a mark alike.
 */

// WCAG 2 relative luminance of a #rrggbb colour.
const luminance = (colour: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The contrast ratio of two #rrggbb colours, 1 to 21. */
export const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The text colour for a tag's mark: black or white, whichever contrasts more with the tag's colour. One of the two is
 * always at least 4.5:1 (WCAG AA for text), so any colour the publisher picks stays readable.
 */
export const textColourFor = (colour: string): '#000000' | '#ffffff' =>
  (contrast(colour, '#000000') >= contrast(colour, '#ffffff') ? '#000000' : '#ffffff')
