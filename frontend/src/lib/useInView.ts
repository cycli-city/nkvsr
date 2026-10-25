import { useEffect, useRef, useState } from 'react'

/**
 * True once the element has come within `margin` of the viewport, and stays true afterwards.
 *
 * Used to defer below-the-fold requests until the reader is about to see them, so they cannot compete with the
 * first-load requests on a small server. Where IntersectionObserver does not exist (older browsers, jsdom in unit
 * tests) the content is simply treated as visible: it loads straight away rather than never.
 */
export function useInView<T extends Element>(margin = '300px') {
  const ref = useRef<T | null>(null)
  const supported = typeof IntersectionObserver !== 'undefined'
  const [seen, setSeen] = useState(!supported)

  useEffect(() => {
    const node = ref.current
    if (seen || !node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen, margin])

  return [ref, seen] as const
}
