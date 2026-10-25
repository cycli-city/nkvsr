import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, renderApp } from './test/utils'

describe('routing', () => {
  it('shows a not-found page for unknown routes', async () => {
    mockApi()
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
