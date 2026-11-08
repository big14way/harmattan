/**
 * The public demo's limits, as plain rules (no ledger or server imports, so they are unit-tested).
 * A visitor plays the operator: runs the agent, approves a payment above the cap, tries to make
 * the agent pay a stranger. These rules keep that from emptying the shared testnet treasury.
 * Limits, payees and invites stay operator-only; the proxy and the routes enforce that part.
 */
import { formatMoney } from '../../ledger/src/money.ts'
import type { DemoStatus } from './types.ts'

/** Why a visitor may not start an agent run now, or null when they may. */
export function demoRunRefusal(s: DemoStatus): string | null {
  if (s.paidTodayCents === null) return 'The public demo could not read the treasury from the ledger just now. Try again in a moment.'
  if (s.paidTodayCents >= s.dailyCents) {
    return `The public demo has paid ${formatMoney(s.paidTodayCents)} from the testnet treasury today, its daily limit of ${formatMoney(s.dailyCents)}. It opens again at midnight (${s.timezone}).`
  }
  if (s.runsLeft <= 0) return `The public demo has used today's agent runs. It opens again at midnight (${s.timezone}).`
  return null
}

/** Why a visitor may not approve this payment, or null when they may. Rejecting is always allowed. */
export function demoApproveRefusal(s: DemoStatus, cents: number): string | null {
  if (cents > s.approvalMaxCents) {
    return `In the public demo you can approve payments up to ${formatMoney(s.approvalMaxCents)}. This one needs the operator to sign in.`
  }
  if (s.paidTodayCents === null) return 'The public demo could not read the treasury from the ledger just now. Try again in a moment.'
  if (s.paidTodayCents + cents > s.dailyCents) {
    return `Approving this would take the public demo past its daily limit of ${formatMoney(s.dailyCents)} from the testnet treasury (${formatMoney(s.paidTodayCents)} paid today). It opens again at midnight (${s.timezone}).`
  }
  return null
}

/** Where today's demo stands, for putting its payouts back on the schedule. */
export interface DemoScheduleCheck {
  /** Scheduled payments the agent has not worked through yet (due today or earlier). */
  dueCount: number
  /** Payments waiting for the operator's signature. */
  pendingCount: number
  /** What one full demo moves from the treasury: inside the limits plus the approved payment. */
  totalCents: number
}

/**
 * Why the demo payouts cannot go back on the schedule now, or null when they can. Only once the
 * last demo is finished, so they are never on it twice. `demo` is the visitor's allowance (null for
 * the operator): a visitor may only start a demo that fits in what is left of the day's limit.
 */
export function demoRescheduleRefusal(c: DemoScheduleCheck, demo: DemoStatus | null): string | null {
  if (c.dueCount) return "Today's demo payouts are already on the schedule. Run today's payouts to pay them."
  if (c.pendingCount) return 'A payment is still waiting for a signature. Approve or reject it first.'
  if (!demo) return null
  const run = demoRunRefusal(demo)
  if (run) return run
  const paid = demo.paidTodayCents ?? 0
  if (paid + c.totalCents > demo.dailyCents) {
    return `Another demo moves ${formatMoney(c.totalCents)}, which would take the public demo past its daily limit of ${formatMoney(demo.dailyCents)} from the testnet treasury (${formatMoney(paid)} paid today). It opens again at midnight (${demo.timezone}).`
  }
  return null
}

/** Phone numbers stay private in the public view: +254712345678 becomes +254 ••• 78. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null
  return `${phone.slice(0, 4)} ••• ${phone.slice(-2)}`
}
