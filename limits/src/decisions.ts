import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { dataDir } from '../../ledger/src/index.ts'
import type { DecisionCode } from './evaluate.ts'

/** One line per cosign request: the service's authoritative ledger log, refusals included. */
export interface DecisionRecord {
  id: string
  at: string
  /** Calendar day and month in the operator's time zone, used for budget windows. */
  day: string
  month: string
  paymentId: string
  payeeId: string | null
  destination: string
  cents: number
  outcome: 'cosigned' | 'refused' | 'failed'
  code: DecisionCode
  reason: string
  /** Who completed the signature: the limits service, or a human operator on an approval. */
  approvedBy: 'limits' | 'operator' | null
  txHash?: string
  ledgerResult?: string
  explorerUrl?: string
}

function file(): string {
  return path.join(dataDir('limits'), 'decisions.jsonl')
}

export function readDecisions(): DecisionRecord[] {
  const f = file()
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DecisionRecord)
}

export function appendDecision(r: DecisionRecord): void {
  appendFileSync(file(), JSON.stringify(r) + '\n')
}

/** Money that actually left (or may still leave) the treasury: cosigned and not failed on ledger. */
export function counts(r: DecisionRecord): boolean {
  return r.outcome === 'cosigned' && (r.ledgerResult === undefined || r.ledgerResult === 'tesSUCCESS')
}

export function calendarKeys(at: Date, timezone: string): { day: string; month: string } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  return { day, month: day.slice(0, 7) }
}

export interface SpendSummary {
  spentTodayCents: number
  spentThisMonthByPayee: Record<string, number>
  paidPaymentIds: Set<string>
}

export function summarize(records: DecisionRecord[], now: Date, timezone: string): SpendSummary {
  const { day, month } = calendarKeys(now, timezone)
  let spentTodayCents = 0
  const spentThisMonthByPayee: Record<string, number> = {}
  const paidPaymentIds = new Set<string>()
  for (const r of records) {
    if (!counts(r)) continue
    paidPaymentIds.add(r.paymentId)
    // Payments an operator signed are logged, but the limits bound what the agent moves on its own.
    if (r.approvedBy !== 'limits') continue
    if (r.day === day) spentTodayCents += r.cents
    if (r.month === month && r.payeeId) {
      spentThisMonthByPayee[r.payeeId] = (spentThisMonthByPayee[r.payeeId] ?? 0) + r.cents
    }
  }
  return { spentTodayCents, spentThisMonthByPayee, paidPaymentIds }
}
