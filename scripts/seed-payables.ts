/**
 * Operator-side: puts payments on the agent's schedule, due today (operator time zone).
 *
 *   pnpm seed p0      one small payment to Wanjiru (first autonomous payment)
 *   pnpm seed demo    the demo run: two payments inside the limits, one above the 15 RLUSD cap
 */
import 'dotenv/config'
import { fromCents } from '../ledger/src/index.ts'
import { seedScenario } from './demo-schedule.ts'

for (const p of seedScenario(process.argv[2] ?? 'p0')) {
  console.log(`scheduled ${p.id}: ${fromCents(p.amountCents)} RLUSD to ${p.payeeId}`)
}
