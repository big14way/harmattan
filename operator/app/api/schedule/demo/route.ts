import { isOperator, publicDemo } from '@/lib/access'
import { rescheduleDemo } from '@/lib/demo'
import { operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

/**
 * Puts the demo payouts back on today's schedule after the last demo finished (demo deployments
 * only). A public-demo visitor may do it while another full demo fits in the day's limit.
 */
export async function POST(req: Request) {
  try {
    const asOperator = await isOperator(req.headers)
    if (!asOperator && !publicDemo()) return Response.json({ error: 'Operator sign-in required' }, { status: 401 })
    const result = await rescheduleDemo(operator(), asOperator)
    if ('refusal' in result) return Response.json({ error: result.refusal }, { status: result.status })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
