import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { IssuedAsset } from '../../ledger/src/config.ts'
import { dataDir } from '../../ledger/src/paths.ts'
import { checkPaymentShape, type PaymentFields } from './evaluate.ts'

/**
 * Payments the limits service would not co-sign but a human can still authorise: above the
 * per-payment cap, over a payee's monthly limit, or over the day's budget. The operator approves by
 * signing a fresh treasury payment with the operator key (weight 2, enough on its own); this
 * service checks that the signed payment is exactly the one that was requested, then submits it.
 */
export const ApprovalSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  payeeId: z.string().nullable(),
  destination: z.string(),
  cents: z.number().int().positive(),
  /** Memo the agent attached, carried onto the operator-signed payment. */
  memo: z.string().default(''),
  code: z.string(),
  reason: z.string(),
  requestedAt: z.string(),
  /** The agent-signed proposal, kept as evidence of exactly what the agent asked for. */
  agentTxBlob: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  note: z.string().optional(),
  txHash: z.string().optional(),
  explorerUrl: z.string().optional(),
  ledgerResult: z.string().optional(),
  lastError: z.string().optional(),
})
export type Approval = z.infer<typeof ApprovalSchema>

function file(): string {
  return path.join(dataDir('limits'), 'approvals.json')
}

export function loadApprovals(): Approval[] {
  if (!existsSync(file())) return []
  return z.array(ApprovalSchema).parse(JSON.parse(readFileSync(file(), 'utf8')))
}

function saveApprovals(list: Approval[]): void {
  writeFileSync(file(), JSON.stringify(list, null, 2) + '\n')
}

export type NewApproval = Pick<Approval, 'paymentId' | 'payeeId' | 'destination' | 'cents' | 'memo' | 'code' | 'reason' | 'agentTxBlob'>

/** Opens an approval request, or returns the pending one for the same payment id. */
export function openApproval(input: NewApproval, now = new Date()): Approval {
  const list = loadApprovals()
  const existing = list.find((a) => a.paymentId === input.paymentId && a.status === 'pending')
  if (existing) return existing
  const approval = ApprovalSchema.parse({ ...input, id: randomUUID().slice(0, 8), requestedAt: now.toISOString(), status: 'pending' })
  list.push(approval)
  saveApprovals(list)
  return approval
}

export function updateApproval(id: string, patch: Partial<Approval>): Approval {
  const list = loadApprovals()
  const i = list.findIndex((a) => a.id === id)
  if (i < 0) throw new Error(`No approval ${id}`)
  const next = ApprovalSchema.parse({ ...list[i], ...patch })
  list[i] = next
  saveApprovals(list)
  return next
}

/** Reads the memo note Harmattan writes into its payout memos ({ id, note } as hex JSON). */
export function payoutNote(tx: { Memos?: Array<{ Memo?: { MemoData?: string } }> }): string {
  const data = tx.Memos?.[0]?.Memo?.MemoData
  if (!data) return ''
  try {
    const parsed = JSON.parse(Buffer.from(data, 'hex').toString('utf8')) as { note?: unknown }
    return typeof parsed.note === 'string' ? parsed.note : ''
  } catch {
    return ''
  }
}

/**
 * Pure check that an operator-signed payment is the one the approval describes: same payee
 * address, same RLUSD amount, same payment id, and otherwise a plain treasury payment.
 */
export function checkApprovalTx(
  tx: PaymentFields,
  approval: Pick<Approval, 'paymentId' | 'destination' | 'cents'>,
  ctx: { treasury: string; asset: IssuedAsset },
): { ok: true } | { ok: false; reason: string } {
  const shape = checkPaymentShape(tx, { ...ctx, paymentId: approval.paymentId })
  if (!shape.ok) return { ok: false, reason: shape.reason }
  if (tx.Destination !== approval.destination) return { ok: false, reason: 'Destination differs from the approval request' }
  if (shape.cents !== approval.cents) return { ok: false, reason: 'Amount differs from the approval request' }
  return { ok: true }
}
