import { z } from 'zod'
import { toCents } from '../../../../ledger/src/money.ts'
import { isOperator } from '@/lib/access'
import { createInvite } from '@/lib/invites'

export const dynamic = 'force-dynamic'

const Body = z.object({
  name: z.string().trim().min(2, 'Add the payee name').max(80),
  city: z.string().trim().max(60).default(''),
  country: z.string().length(2),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, 'WhatsApp number in international format, e.g. +254712345678'))
    .optional()
    .or(z.literal('').transform(() => undefined)),
  monthly: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Use an amount like 30 or 30.50'),
})

/** Operator creates an onboarding link for a new payee. */
export async function POST(req: Request) {
  if (!(await isOperator(req.headers))) return Response.json({ error: 'Operator sign-in required' }, { status: 401 })
  try {
    const b = Body.parse(await req.json())
    const invite = createInvite({ name: b.name, city: b.city, country: b.country.toUpperCase(), phone: b.phone, monthlyLimitCents: toCents(b.monthly) })
    return Response.json({ invite })
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : (err as Error).message
    return Response.json({ error: msg }, { status: 400 })
  }
}
