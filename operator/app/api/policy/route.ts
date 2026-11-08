import { z } from 'zod'
import { toCents } from '../../../../ledger/src/money.ts'
import type { PolicyUpdate } from '../../../../limits/src/policy.ts'
import { isOperator } from '@/lib/access'
import { operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

const Amount = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Use an amount like 15 or 15.50')
const Body = z.object({
  cap: Amount.optional(),
  budget: Amount.optional(),
  paused: z.boolean().optional(),
  payee: z
    .object({
      id: z.string(),
      monthly: Amount.optional(),
      active: z.boolean().optional(),
      /** Operator confirms an address that arrived through an invite link; this switches the payee on. */
      confirm: z.literal(true).optional(),
      phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'WhatsApp number in international format, e.g. +254712345678').nullable().optional(),
    })
    .optional(),
})

/** The operator changes limits here; the dashboard server holds the operator token, the browser never does. */
export async function PUT(req: Request) {
  if (!(await isOperator(req.headers))) return Response.json({ error: 'Operator sign-in required' }, { status: 401 })
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
      const next = {
        ...p,
        monthlyLimitCents: body.payee.monthly !== undefined ? toCents(body.payee.monthly) : p.monthlyLimitCents,
        active: body.payee.confirm ? true : (body.payee.active ?? p.active),
        pendingConfirmation: body.payee.confirm ? undefined : p.pendingConfirmation,
      }
      if (next.pendingConfirmation && next.active) {
        return Response.json({ error: 'Confirm the address before switching this payee on' }, { status: 400 })
      }
      if (body.payee.phone !== undefined) {
        if (body.payee.phone === null) delete next.phone
        else next.phone = body.payee.phone
      }
      update.payees = { ...policy.payees, [p.id]: next }
    }
    return Response.json(await op.updatePolicy(update))
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : (err as Error).message
    return Response.json({ error: msg }, { status: 400 })
  }
}
