import 'server-only'
import { readDeployment, rlusdSent, toCents } from '../../ledger/src/index.ts'
import { calendarKeys } from '../../limits/src/decisions.ts'
import { loadPayables, type Payable } from '../../agent/src/payables.ts'
import { SCENARIOS, scenarioTotalCents, seedScenario } from '../../scripts/demo-schedule.ts'
import type { OperatorConsole } from './console.ts'
import { demoRescheduleRefusal, demoRunRefusal } from './demo-rules.ts'
import type { DemoSchedule, DemoStatus } from './types.ts'

const APPROVAL_MAX_CENTS = toCents(process.env.HARMATTAN_PUBLIC_APPROVAL_MAX ?? '40')
/** Two full demos a day: each pays 12.00 and 9.50 inside the limits and 40.00 after approval. */
const DAILY_CENTS = toCents(process.env.HARMATTAN_PUBLIC_DAILY_RLUSD ?? '123')
/** Agent runs a visitor may start per day (each one is a few model calls on the operator's key). */
const RUNS_PER_DAY = 40

let paidCache: { at: number; day: string; cents: number } | null = null

/**
 * What the treasury paid out today (operator time zone), read from the ledger, so the limit holds
 * when the free host wipes its disk. Payments from every copy of Harmattan on this treasury count.
 */
async function treasuryPaidToday(timezone: string): Promise<number> {
  const day = calendarKeys(new Date(), timezone).day
  if (paidCache && paidCache.day === day && Date.now() - paidCache.at < 15_000) return paidCache.cents
  const treasury = readDeployment().accounts.treasury
  if (!treasury) throw new Error('No treasury in the deployment record')
  const sent = await rlusdSent(treasury, { limit: 200 })
  const cents = sent.filter((p) => p.at && calendarKeys(new Date(p.at), timezone).day === day).reduce((sum, p) => sum + p.cents, 0)
  paidCache = { at: Date.now(), day, cents }
  return cents
}

/** Call after a payment, so the next check reads the ledger again. */
export function invalidateDemoSpend(): void {
  paidCache = null
}

// Counted in memory: a restart resets it, which only ever happens after the instance has slept.
const runsByDay = new Map<string, number>()

function runsToday(timezone: string): number {
  return runsByDay.get(calendarKeys(new Date(), timezone).day) ?? 0
}

export async function demoStatus(timezone: string): Promise<DemoStatus> {
  const paidTodayCents = await treasuryPaidToday(timezone).catch(() => null)
  return {
    approvalMaxCents: APPROVAL_MAX_CENTS,
    dailyCents: DAILY_CENTS,
    paidTodayCents,
    runsLeft: Math.max(0, RUNS_PER_DAY - runsToday(timezone)),
    timezone,
  }
}

/** Counts a visitor's run if the demo allows one now; returns the reason when it does not. */
export async function takeDemoRun(timezone: string): Promise<string | null> {
  const refusal = demoRunRefusal(await demoStatus(timezone))
  if (refusal) return refusal
  const day = calendarKeys(new Date(), timezone).day
  const count = runsToday(timezone) + 1
  runsByDay.clear() // only today's count matters
  runsByDay.set(day, count)
  return null
}

/** The demo payouts this deployment schedules on boot (HARMATTAN_DEMO_SCHEDULE), or null. */
export function demoSchedule(): DemoSchedule | null {
  const name = process.env.HARMATTAN_DEMO_SCHEDULE
  const items = name ? SCENARIOS[name] : undefined
  return name && items ? { name, count: items.length, totalCents: scenarioTotalCents(name) } : null
}

/**
 * Puts the demo payouts back on today's schedule once the last demo is finished, so the next
 * person can run it from the start. Returns the payouts added, or why not.
 */
export async function rescheduleDemo(op: OperatorConsole, asOperator: boolean): Promise<{ added: Payable[] } | { refusal: string; status: number }> {
  const schedule = demoSchedule()
  if (!schedule) return { refusal: 'This deployment has no demo schedule.', status: 404 }
  const [view, approvals] = await Promise.all([op.view(), op.approvals()])
  const demo = asOperator ? null : await demoStatus(view.policy.timezone)
  // Nothing awaits from here on, so two people clicking at once cannot both add the payouts.
  const today = calendarKeys(new Date(), view.policy.timezone).day
  const check = {
    dueCount: loadPayables().filter((p) => p.status === 'scheduled' && p.dueDate <= today).length,
    pendingCount: approvals.filter((a) => a.status === 'pending').length,
    totalCents: schedule.totalCents,
  }
  const refusal = demoRescheduleRefusal(check, demo)
  if (refusal) return { refusal, status: 409 }
  return { added: seedScenario(schedule.name, Date.now().toString(36).slice(-5), view.policy.timezone) }
}
