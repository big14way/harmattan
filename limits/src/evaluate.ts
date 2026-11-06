import type { IssuedAsset } from '../../ledger/src/config.ts'
import { formatMoney, toCents } from '../../ledger/src/money.ts'
import { invoiceIdFor } from '../../ledger/src/rlusd.ts'
import type { SpendSummary } from './decisions.ts'
import type { Policy } from './policy.ts'

export type DecisionCode =
  | 'OK'
  | 'BAD_TX'
  | 'BAD_SIGNATURE'
  | 'PAUSED'
  | 'UNKNOWN_PAYEE'
  | 'PAYEE_INACTIVE'
  | 'DUPLICATE'
  | 'OVER_CAP'
  | 'OVER_PAYEE_MONTHLY'
  | 'OVER_DAILY_BUDGET'
  | 'APPROVED_BY_OPERATOR'

export interface Decision {
  ok: boolean
  code: DecisionCode
  reason: string
  payeeId: string | null
  cents: number
  /** True when a human signature can still make this payment go through. */
  needsApproval: boolean
}

/** The subset of a decoded Payment the policy looks at. */
export interface PaymentFields {
  TransactionType?: unknown
  Account?: unknown
  Destination?: unknown
  Amount?: unknown
  SendMax?: unknown
  DeliverMin?: unknown
  Paths?: unknown
  Flags?: unknown
  Fee?: unknown
  LastLedgerSequence?: unknown
  InvoiceID?: unknown
  DestinationTag?: unknown
}

export interface EvaluateInput {
  policy: Policy
  spend: SpendSummary
  tx: PaymentFields
  paymentId: string
  treasury: string
  asset: IssuedAsset
  agentSignatureValid: boolean
  /** Fee ceiling in drops; stops a compromised agent from burning treasury XRP on fees. */
  maxFeeDrops?: number
}

function refuse(code: DecisionCode, reason: string, payeeId: string | null, cents: number, needsApproval = false): Decision {
  return { ok: false, code, reason, payeeId, cents, needsApproval }
}

/**
 * Pure policy check for one agent-signed treasury payment. No I/O: everything it needs is passed
 * in, so the same function is what the service runs and what the tests exercise.
 */
export function evaluatePayment(input: EvaluateInput): Decision {
  const { policy, spend, tx, paymentId, treasury, asset } = input
  const maxFee = input.maxFeeDrops ?? 5_000

  if (tx.TransactionType !== 'Payment') return refuse('BAD_TX', 'Only Payment transactions are co-signed', null, 0)
  if (tx.Account !== treasury) return refuse('BAD_TX', 'Payment must come from the Harmattan treasury', null, 0)
  if (tx.SendMax !== undefined || tx.DeliverMin !== undefined || tx.Paths !== undefined) {
    return refuse('BAD_TX', 'Cross-currency fields (SendMax, DeliverMin, Paths) are not allowed', null, 0)
  }
  if (tx.Flags !== undefined && tx.Flags !== 0) return refuse('BAD_TX', 'Payment flags are not allowed', null, 0)
  if (typeof tx.LastLedgerSequence !== 'number') return refuse('BAD_TX', 'LastLedgerSequence is required', null, 0)
  if (typeof tx.Fee !== 'string' || Number(tx.Fee) > maxFee) return refuse('BAD_TX', `Fee above ${maxFee} drops`, null, 0)

  const amount = tx.Amount as { currency?: string; issuer?: string; value?: string } | string | undefined
  if (!amount || typeof amount === 'string' || amount.currency !== asset.currency || amount.issuer !== asset.issuer) {
    return refuse('BAD_TX', `Amount must be ${asset.symbol} from issuer ${asset.issuer}`, null, 0)
  }
  let cents: number
  try {
    cents = toCents(amount.value ?? '')
  } catch {
    return refuse('BAD_TX', `Amount ${amount.value} is not a 2-decimal value`, null, 0)
  }
  if (cents <= 0) return refuse('BAD_TX', 'Amount must be positive', null, 0)
  if (tx.InvoiceID !== invoiceIdFor(paymentId)) {
    return refuse('BAD_TX', 'InvoiceID does not match the payment id', null, cents)
  }
  if (!input.agentSignatureValid) {
    return refuse('BAD_SIGNATURE', 'Request must carry exactly one valid signature, from the agent key', null, cents)
  }

  const payee = Object.values(policy.payees).find((p) => p.address === tx.Destination) ?? null
  const payeeId = payee?.id ?? null
  if (policy.paused) return refuse('PAUSED', 'The operator has paused all agent payments', payeeId, cents)
  if (!payee) return refuse('UNKNOWN_PAYEE', `Destination ${String(tx.Destination)} is not an approved payee`, null, cents)
  if (!payee.active) return refuse('PAYEE_INACTIVE', `${payee.name} is not active`, payeeId, cents)
  if (spend.paidPaymentIds.has(paymentId)) return refuse('DUPLICATE', `Payment ${paymentId} was already made`, payeeId, cents)

  if (cents > policy.perPaymentCapCents) {
    return refuse(
      'OVER_CAP',
      `${formatMoney(cents)} is above the per-payment cap of ${formatMoney(policy.perPaymentCapCents)}; an operator must approve it`,
      payeeId,
      cents,
      true,
    )
  }
  const payeeSpent = spend.spentThisMonthByPayee[payee.id] ?? 0
  if (payeeSpent + cents > payee.monthlyLimitCents) {
    return refuse(
      'OVER_PAYEE_MONTHLY',
      `${payee.name} has ${formatMoney(Math.max(0, payee.monthlyLimitCents - payeeSpent))} left of a ${formatMoney(payee.monthlyLimitCents)} monthly limit`,
      payeeId,
      cents,
      true,
    )
  }
  if (spend.spentTodayCents + cents > policy.dailyBudgetCents) {
    return refuse(
      'OVER_DAILY_BUDGET',
      `Only ${formatMoney(Math.max(0, policy.dailyBudgetCents - spend.spentTodayCents))} left of today's ${formatMoney(policy.dailyBudgetCents)} budget`,
      payeeId,
      cents,
      true,
    )
  }
  return { ok: true, code: 'OK', reason: 'Within policy', payeeId, cents, needsApproval: false }
}
