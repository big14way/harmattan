import { dashboardPassword, OPERATOR_COOKIE, operatorCookieValue } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * Operator sign-in. The proxy has already checked the password (HTTP basic auth) before this runs;
 * this remembers the sign-in in a cookie and goes back to the console.
 */
export async function GET(req: Request) {
  const headers = new Headers({ location: '/' })
  const password = dashboardPassword()
  if (password) {
    const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
    const secure = proto === 'https' ? '; Secure' : ''
    headers.append('set-cookie', `${OPERATOR_COOKIE}=${await operatorCookieValue(password)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${secure}`)
  }
  return new Response(null, { status: 303, headers })
}
