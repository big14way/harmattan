/**
 * Operator-side: puts payments on the agent's schedule, due today (operator time zone).
 *
 *   pnpm seed p0      one small payment to Wanjiru (first autonomous payment)
 *   pnpm seed demo    the demo run: two payments inside the limits, one above the 15 RLUSD cap
 */
import 'dotenv/config'
import { toCents } from '../ledger/src/index.ts'
import { calendarKeys } from '../limits/src/decisions.ts'
import { loadPolicy } from '../limits/src/policy.ts'
import { upsertPayable, type Payable } from '../agent/src/payables.ts'

const SCENARIOS: Record<string, Array<Pick<Payable, 'payeeId' | 'description'> & { amount: string; key: string }>> = {
  p0: [{ key: 'wanjiru-oct-illustrations', payeeId: 'wanjiru', amount: '2.50', description: 'Brand illustrations, October milestone' }],
  demo: [
    { key: 'wanjiru-nov-illustrations', payeeId: 'wanjiru', amount: '12.00', description: 'Campaign illustrations, November milestone 1' },
    { key: 'okello-api-sprint', payeeId: 'okello', amount: '9.50', description: 'Payments API sprint, week 45' },
    { key: 'thandi-launch-video', payeeId: 'thandi', amount: '40.00', description: 'Launch video edit and colour grade' },
  ],
}

const name = process.argv[2] ?? 'p0'
const scenario = SCENARIOS[name]
if (!scenario) throw new Error(`Unknown scenario "${name}". Try: ${Object.keys(SCENARIOS).join(', ')}`)
const policy = loadPolicy()
const { day } = calendarKeys(new Date(), policy.timezone)
for (const s of scenario) {
  const id = `${s.key}-${day}`
  upsertPayable({
    id,
    payeeId: s.payeeId,
    amountCents: toCents(s.amount),
    dueDate: day,
    description: s.description,
    status: 'scheduled',
    updatedAt: new Date().toISOString(),
  })
  console.log(`scheduled ${id}: ${s.amount} RLUSD to ${s.payeeId}`)
}
