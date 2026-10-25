/**
 * Content-Security-Policy for the single-page app: the one definition the Vite preview server (used by the
 * browser tests) and the unit test that keeps `vercel.json` and `nginx.conf.template` in step both use.
 *
 * There is deliberately no 'unsafe-inline' and no 'unsafe-eval': the app ships one external script and one
 * stylesheet, fonts are bundled, and charts are SVG drawn by React (which sets styles through the CSSOM).
 */
export interface CspOptions {
  /** Origins the app may call: `'self'` alone when /api is proxied, plus the API host when it is separate. */
  connect: string[]
  /** Only for sites served over HTTPS (it would break plain-http localhost). */
  upgradeInsecureRequests?: boolean
}

export function buildCsp({ connect, upgradeInsecureRequests = false }: CspOptions): string {
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'"]],
    ['style-src', ["'self'"]],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', connect],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  const parts = directives.map(([name, sources]) => `${name} ${sources.join(' ')}`)
  if (upgradeInsecureRequests) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'

/** Same-origin deployments (nginx container, local preview): the API is reached through /api. */
export const CSP_SAME_ORIGIN = buildCsp({ connect: ["'self'"] })
/**
 * The one cross-origin host the Vercel build may call: the deployed API. Deliberately the exact origin, not a wildcard,
 * so even injected script could not send data to another Render-hosted app. If the API is deployed under another
 * name, change it here and in `vercel.json` (the unit test fails until both agree; docs/06-DEPLOYMENT.md, step 3).
 */
export const API_ORIGIN = 'https://windscope-api-5joc.onrender.com'
/** Vercel: the API lives on another host (Render). */
export const CSP_VERCEL = buildCsp({
  connect: ["'self'", API_ORIGIN],
  upgradeInsecureRequests: true,
})
