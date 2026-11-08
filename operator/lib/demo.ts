import 'server-only'
import { readDeployment, rlusdSent, toCents } from '../../ledger/src/index.ts'
import { calendarKeys } from '../../limits/src/decisions.ts'
import { demoRunRefusal } from './demo-rules.ts'
import type { DemoStatus } from './types.ts'

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
