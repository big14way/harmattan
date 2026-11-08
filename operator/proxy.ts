import { NextResponse, type NextRequest } from 'next/server'
import { dashboardPassword, isOperator, publicDemo } from '@/lib/access'

/**
 * When HARMATTAN_DASHBOARD_PASSWORD is set (any hosted deployment), the operator console needs it
 * (HTTP basic auth at /signin, any user name). Payee pages and invite links stay public: they show
 * one payee's own data and can only add an inactive payee.
 */
const PUBLIC = [/^\/join\//, /^\/p\//, /^\/api\/join\//, /^\/api\/health$/, /^\/icon\.svg$/]

/**
 * With HARMATTAN_PUBLIC_DEMO=1, visitors can also open the console and run the demo. Limits,
 * payees and invites stay operator-only; the run and approval routes apply the demo's limits.
 */
const DEMO: Array<[string, RegExp]> = [
  ['GET', /^\/$/],
  ['GET', /^\/api\/state$/],
  ['GET', /^\/api\/ledger\.csv$/],
  ['POST', /^\/api\/run$/],
  ['POST', /^\/api\/approvals\/[^/]+$/],
  ['POST', /^\/api\/schedule\/demo$/],
]

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (!dashboardPassword() || PUBLIC.some((r) => r.test(path))) return NextResponse.next()
  if (await isOperator(req.headers)) return NextResponse.next()
  if (publicDemo() && DEMO.some(([method, r]) => method === req.method && r.test(path))) return NextResponse.next()
  return new NextResponse('Operator sign-in required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Harmattan operator", charset="UTF-8"' } })
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' }
