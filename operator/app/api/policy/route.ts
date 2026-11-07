import { z } from 'zod'
import { toCents } from '../../../../ledger/src/money.ts'
import type { PolicyUpdate } from '../../../../limits/src/policy.ts'
import { operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

const Amount = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Use an amount like 15 or 15.50')
const Body = z.object({
  cap: Amount.optional(),
  budget: Amount.optional(),
  paused: z.boolean().optional(),
  payee: z.object({ id: z.string(), monthly: Amount.optional(), active: z.boolean().optional() }).optional(),
})

/** The operator changes limits here; the dashboard server holds the operator token, the browser never does. */
export async function PUT(req: Request) {
  try {
    const body = Body.parse(await req.json())
    const op = operator()
    const update: PolicyUpdate = {}
    if (body.cap !== undefined) update.perPaymentCapCents = toCents(body.cap)
    if (body.budget !== undefined) update.dailyBudgetCents = toCents(body.budget)
    if (body.paused !== undefined) update.paused = body.paused
    if (body.payee) {
      const { policy } = await op.view()
      const p = policy.payees[body.payee.id]
      if (!p) return Response.json({ error: `Unknown payee ${body.payee.id}` }, { status: 404 })
      update.payees = {
        ...policy.payees,
        [p.id]: {
          ...p,
          monthlyLimitCents: body.payee.monthly !== undefined ? toCents(body.payee.monthly) : p.monthlyLimitCents,
          active: body.payee.active ?? p.active,
        },
      }
    }
    return Response.json(await op.updatePolicy(update))
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : (err as Error).message
    return Response.json({ error: msg }, { status: 400 })
  }
}
