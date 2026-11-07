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

export interface ShapeContext {
  treasury: string
  asset: IssuedAsset
  paymentId: string
  /** Fee ceiling in drops; stops a compromised signer from burning treasury XRP on fees. */
  maxFeeDrops?: number
}

export type ShapeResult = { ok: true; cents: number } | { ok: false; reason: string; cents: number }

/**
 * Structural checks every treasury payment must pass before anyone co-signs it: a plain RLUSD
 * Payment from the treasury, no cross-currency paths or flags, bounded fee and lifetime, and an
 * InvoiceID that binds it to one Harmattan payment id.
 */
export function checkPaymentShape(tx: PaymentFields, ctx: ShapeContext): ShapeResult {
  const maxFee = ctx.maxFeeDrops ?? 5_000
  const bad = (reason: string, cents = 0): ShapeResult => ({ ok: false, reason, cents })
  if (tx.TransactionType !== 'Payment') return bad('Only Payment transactions are co-signed')
  if (tx.Account !== ctx.treasury) return bad('Payment must come from the Harmattan treasury')
  if (tx.SendMax !== undefined || tx.DeliverMin !== undefined || tx.Paths !== undefined) {
    return bad('Cross-currency fields (SendMax, DeliverMin, Paths) are not allowed')
  }
  if (tx.Flags !== undefined && tx.Flags !== 0) return bad('Payment flags are not allowed')
  if (typeof tx.LastLedgerSequence !== 'number') return bad('LastLedgerSequence is required')
  if (typeof tx.Fee !== 'string' || Number(tx.Fee) > maxFee) return bad(`Fee above ${maxFee} drops`)

  const amount = tx.Amount as { currency?: string; issuer?: string; value?: string } | string | undefined
  if (!amount || typeof amount === 'string' || amount.currency !== ctx.asset.currency || amount.issuer !== ctx.asset.issuer) {
    return bad(`Amount must be ${ctx.asset.symbol} from issuer ${ctx.asset.issuer}`)
  }
  let cents: number
  try {
    cents = toCents(amount.value ?? '')
  } catch {
    return bad(`Amount ${amount.value} is not a 2-decimal value`)
  }
  if (cents <= 0) return bad('Amount must be positive')
  if (tx.InvoiceID !== invoiceIdFor(ctx.paymentId)) return bad('InvoiceID does not match the payment id', cents)
  return { ok: true, cents }
}

/**
 * Pure policy check for one agent-signed treasury payment. No I/O: everything it needs is passed
 * in, so the same function is what the service runs and what the tests exercise.
 */
export function evaluatePayment(input: EvaluateInput): Decision {
  const { policy, spend, tx, paymentId, treasury, asset } = input

  const shape = checkPaymentShape(tx, { treasury, asset, paymentId, maxFeeDrops: input.maxFeeDrops })
  if (!shape.ok) return refuse('BAD_TX', shape.reason, null, shape.cents)
  const cents = shape.cents
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
