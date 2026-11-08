import { z } from 'zod'
import { isOperator, publicDemo } from '@/lib/access'
import { demoStatus, invalidateDemoSpend } from '@/lib/demo'
import { demoApproveRefusal } from '@/lib/demo-rules'
import { invalidateBalances, operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

const Body = z.object({ action: z.enum(['approve', 'reject']), note: z.string().max(200).optional() })

/** Approve signs with the operator key on this server and hands the payment to the limits service. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = Body.parse(await req.json())
    const op = operator()
    // A public-demo visitor may reject anything, and approve only within the demo's limits.
    if (!(await isOperator(req.headers))) {
      if (!publicDemo()) return Response.json({ error: 'Operator sign-in required' }, { status: 401 })
      if (body.action === 'approve') {
        const approval = (await op.approvals()).find((a) => a.id === id)
        if (!approval) return Response.json({ error: `No approval ${id}` }, { status: 404 })
        const refusal = demoApproveRefusal(await demoStatus((await op.view()).policy.timezone), approval.cents)
        if (refusal) return Response.json({ error: refusal }, { status: 403 })
      }
    }
    if (body.action === 'reject') return Response.json({ status: 'rejected', approval: await op.reject(id, body.note) })
    const result = await op.approve(id)
    invalidateBalances()
    invalidateDemoSpend()
    return Response.json(result, { status: result.status === 'paid' ? 200 : 502 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
