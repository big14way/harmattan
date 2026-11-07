import { z } from 'zod'
import { invalidateBalances, operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

const Body = z.object({ action: z.enum(['approve', 'reject']), note: z.string().max(200).optional() })

/** Approve signs with the operator key on this server and hands the payment to the limits service. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = Body.parse(await req.json())
    const op = operator()
    if (body.action === 'reject') return Response.json({ status: 'rejected', approval: await op.reject(id, body.note) })
    const result = await op.approve(id)
    invalidateBalances()
    return Response.json(result, { status: result.status === 'paid' ? 200 : 502 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
