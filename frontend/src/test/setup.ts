import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'
import type * as Recharts from 'recharts'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// jsdom does no layout, so Recharts' ResponsiveContainer would measure 0x0 and draw nothing. Give charts a
// fixed size so the real chart code runs (catching runtime errors in tooltips, ticks, shapes, ...).
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof Recharts>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 320 }),
  }
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
