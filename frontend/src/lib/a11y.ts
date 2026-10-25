/**
 * Attributes that make a horizontally/vertically scrolling container reachable and operable by keyboard
 * (WCAG 2.1.1; axe rule `scrollable-region-focusable`) and announced as a named region.
 */
export const scrollRegion = (label: string) => ({ role: 'region', 'aria-label': label, tabIndex: 0 }) as const
