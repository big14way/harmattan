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

/** Phone numbers stay private in the public view: +254712345678 becomes +254 ••• 78. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null
  return `${phone.slice(0, 4)} ••• ${phone.slice(-2)}`
}
