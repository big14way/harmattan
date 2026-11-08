/**
 * Who is using the console. With HARMATTAN_DASHBOARD_PASSWORD set (any hosted deployment) the
 * operator signs in at /signin with HTTP basic auth (any user name); that also sets a cookie. With
 * HARMATTAN_PUBLIC_DEMO=1 as well, everyone else can open the console and use the demo actions,
 * and the run and approval routes enforce the demo limits. No password: local use, all operator.
 *
 * Plain functions with no server-only imports, so the proxy can use them too.
 */

export const OPERATOR_COOKIE = 'harmattan_operator'

export function dashboardPassword(): string | null {
  return process.env.HARMATTAN_DASHBOARD_PASSWORD || null
}

export function publicDemo(): boolean {
  return Boolean(dashboardPassword()) && process.env.HARMATTAN_PUBLIC_DEMO === '1'
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function basicAuthMatches(header: string | null, password: string): boolean {
  const [scheme, encoded] = (header ?? '').split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  try {
    const decoded = atob(encoded)
    return same(decoded.slice(decoded.indexOf(':') + 1), password)
  } catch {
    return false
  }
}

/** The cookie /signin sets: a hash of the password, so the cookie never holds the password itself. */
export async function operatorCookieValue(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`harmattan-operator:${password}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/** True for the signed-in operator, and for everyone when no password is set (local use). */
export async function isOperator(headers: Headers): Promise<boolean> {
  const password = dashboardPassword()
  if (!password) return true
  if (basicAuthMatches(headers.get('authorization'), password)) return true
  const cookie = readCookie(headers.get('cookie'), OPERATOR_COOKIE)
  return cookie !== null && same(cookie, await operatorCookieValue(password))
}
