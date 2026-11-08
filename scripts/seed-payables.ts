/**
 * Operator-side: puts payments on the agent's schedule, due today (operator time zone).
 *
 *   pnpm seed p0                one small payment to Wanjiru (first autonomous payment)
 *   pnpm seed demo              the demo run: two payments inside the limits, one above the 15 RLUSD cap
 *   pnpm seed demo --if-empty   only when nothing is on the schedule (the hosted demo after a wipe),
 *                               with fresh payment ids
 */
import 'dotenv/config'
import { loadPayables } from '../agent/src/payables.ts'
import { fromCents } from '../ledger/src/index.ts'
import { seedScenario } from './demo-schedule.ts'

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--')) ?? 'p0'
const ifEmpty = args.includes('--if-empty')
const existing = loadPayables().length

if (ifEmpty && existing) {
  console.log(`schedule already holds ${existing} payment(s); nothing added`)
} else {
  // A fresh suffix keeps payment ids unique across wipes, as pnpm demo:reset does.
  for (const p of seedScenario(name, ifEmpty ? Date.now().toString(36).slice(-5) : undefined)) {
    console.log(`scheduled ${p.id}: ${fromCents(p.amountCents)} RLUSD to ${p.payeeId}`)
  }
}
