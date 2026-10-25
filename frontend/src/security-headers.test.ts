import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { API_ORIGIN, CSP_SAME_ORIGIN, CSP_VERCEL, PERMISSIONS_POLICY, buildCsp } from '../csp'

const root = resolve(__dirname, '..')
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}
const nginx = readFileSync(resolve(root, 'nginx.conf.template'), 'utf8')

const vercelHeader = (key: string) =>
  vercel.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === key)?.value

/** Directive -> sorted sources, so two policies compare regardless of ordering or whitespace. */
const parse = (policy: string) =>
  Object.fromEntries(
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...sources]) => [name, [...sources].sort()]),
  )

describe('security headers stay in step across every place the UI is served', () => {
  it('Vercel serves exactly the policy defined in csp.ts', () => {
    expect(parse(vercelHeader('Content-Security-Policy') ?? '')).toEqual(parse(CSP_VERCEL))
  })

  it('nginx serves exactly the same-origin policy defined in csp.ts', () => {
    const match = /default "([^"]+)";/.exec(nginx)
    expect(match, 'nginx.conf.template must define the default CSP in its map block').not.toBeNull()
    expect(parse(match![1]!)).toEqual(parse(CSP_SAME_ORIGIN))
  })

  it('the policy is strict: no inline or eval scripts, no framing, no plugins, no foreign scripts', () => {
    for (const policy of [CSP_VERCEL, CSP_SAME_ORIGIN]) {
      const p = parse(policy)
      expect(p['script-src']).toEqual(["'self'"])
      expect(policy).not.toMatch(/unsafe-(inline|eval)/)
      expect(p['frame-ancestors']).toEqual(["'none'"])
      expect(p['object-src']).toEqual(["'none'"])
      expect(p['base-uri']).toEqual(["'self'"])
      expect(p['default-src']).toEqual(["'self'"])
    }
  })

  it('only the cross-host deployment may call another origin, and only the API host', () => {
    expect(parse(CSP_SAME_ORIGIN)['connect-src']).toEqual(["'self'"])
    expect(parse(CSP_VERCEL)['connect-src']).toEqual(["'self'", API_ORIGIN].sort())
    expect(API_ORIGIN).toMatch(/^https:\/\/[a-z0-9-]+\.onrender\.com$/) // one exact https origin, never a wildcard
    expect(CSP_VERCEL).toContain('upgrade-insecure-requests')
    expect(CSP_SAME_ORIGIN).not.toContain('upgrade-insecure-requests') // would break plain-http localhost
  })

  it('Permissions-Policy and cross-origin isolation headers match everywhere', () => {
    expect(vercelHeader('Permissions-Policy')).toBe(PERMISSIONS_POLICY)
    expect(nginx).toContain(`add_header Permissions-Policy "${PERMISSIONS_POLICY}" always;`)
    expect(vercelHeader('Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(nginx).toContain('add_header Cross-Origin-Opener-Policy "same-origin" always;')
  })

  it('every classic hardening header is present on Vercel', () => {
    expect(vercelHeader('X-Content-Type-Options')).toBe('nosniff')
    expect(vercelHeader('X-Frame-Options')).toBe('DENY')
    expect(vercelHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('buildCsp renders directives in a stable, readable form', () => {
    expect(buildCsp({ connect: ["'self'", 'https://api.example'] })).toContain(
      "connect-src 'self' https://api.example; object-src 'none'",
    )
  })
})
