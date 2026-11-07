import { NextResponse, type NextRequest } from 'next/server'

/**
 * When HARMATTAN_DASHBOARD_PASSWORD is set (any hosted deployment), the operator console needs it
 * (HTTP basic auth, any user name). Payee pages and invite links stay public: they show one
 * payee's own data and can only add an inactive payee.
 */
const PUBLIC = [/^\/join\//, /^\/p\//, /^\/api\/join\//, /^\/api\/health$/, /^\/icon\.svg$/]

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function proxy(req: NextRequest) {
  const password = process.env.HARMATTAN_DASHBOARD_PASSWORD
  if (!password || PUBLIC.some((r) => r.test(req.nextUrl.pathname))) return NextResponse.next()
  const [scheme, encoded] = (req.headers.get('authorization') ?? '').split(' ')
  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = atob(encoded)
      if (same(decoded.slice(decoded.indexOf(':') + 1), password)) return NextResponse.next()
    } catch {}
  }
  return new NextResponse('Operator sign-in required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Harmattan operator", charset="UTF-8"' } })
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' }
