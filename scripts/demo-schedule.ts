import { toCents } from '../ledger/src/index.ts'
import { calendarKeys } from '../limits/src/decisions.ts'
import { loadPolicy } from '../limits/src/policy.ts'
import { upsertPayable, type Payable } from '../agent/src/payables.ts'

type Item = Pick<Payable, 'payeeId' | 'description'> & { amount: string; key: string }

/** Operator-side payment schedules used in the demo. */
export const SCENARIOS: Record<string, Item[]> = {
  p0: [{ key: 'wanjiru-oct-illustrations', payeeId: 'wanjiru', amount: '2.50', description: 'Brand illustrations, October milestone' }],
  demo: [
    { key: 'wanjiru-nov-illustrations', payeeId: 'wanjiru', amount: '12.00', description: 'Campaign illustrations, November milestone 1' },
    { key: 'okello-api-sprint', payeeId: 'okello', amount: '9.50', description: 'Payments API sprint, week 45' },
    { key: 'thandi-launch-video', payeeId: 'thandi', amount: '40.00', description: 'Launch video edit and colour grade' },
  ],
}

export function scenarioTotalCents(name: string): number {
  return (SCENARIOS[name] ?? []).reduce((s, i) => s + toCents(i.amount), 0)
}

/** Puts a scenario on today's schedule. A suffix keeps payment ids unique across demo runs. */
export function seedScenario(name: string, suffix?: string): Payable[] {
  const scenario = SCENARIOS[name]
  if (!scenario) throw new Error(`Unknown scenario "${name}". Try: ${Object.keys(SCENARIOS).join(', ')}`)
  const { day } = calendarKeys(new Date(), loadPolicy().timezone)
  return scenario.map((s) => {
    const p: Payable = {
      id: [s.key, day, suffix].filter(Boolean).join('-'),
      payeeId: s.payeeId,
      amountCents: toCents(s.amount),
      dueDate: day,
      description: s.description,
      status: 'scheduled',
      updatedAt: new Date().toISOString(),
    }
    upsertPayable(p)
    return p
  })
}
